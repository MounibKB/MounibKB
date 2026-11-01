#!/usr/bin/env bash
# Rebuilds the fixed APK from the original one. Requires: dotnet SDK 8, java (jarsigner), openssl, python3.
# Usage: ./build.sh <original.apk> <out.apk> <managed_dir_extracted_from_original> <testkey.pk8> <testkey.x509.pem>
#   The signing key is the public AOSP "testkey" - the original APK is signed with exactly this certificate
#   (SHA1 61:ED:37:7E:85:D3:86:A8:DF:EE:6B:86:4B:D8:5B:0B:FA:A5:AF:81), so the fixed build installs over it.
set -euo pipefail
ORIG=$1; OUT=$2; M=$3; PK8=$4; PEM=$5
HERE=$(cd "$(dirname "$0")" && pwd); W=$(mktemp -d)
export DOTNET_CLI_TELEMETRY_OPTOUT=1 DOTNET_NOLOGO=1 DOTNET_ROLL_FORWARD=Major MANAGED_DIR=$M
dotnet build -c Release -o "$W/patcher" "$HERE/patcher/Patcher.csproj"
dotnet "$W/patcher/Patcher.dll" makeref "$M/Assembly-CSharp.dll" "$W/ref.dll"      # publicised reference copy
CSC=$(ls /usr/lib/dotnet/sdk/*/Roslyn/bincore/csc.dll | head -1)
mkdir -p "$W/ref"; mv "$W/ref.dll" "$W/ref/Assembly-CSharp.dll"
dotnet "$CSC" -nologo -nostdlib -noconfig -target:library -langversion:7.3 -optimize+ -debug- \
  -r:"$M/mscorlib.dll" -r:"$M/System.dll" -r:"$M/System.Core.dll" -r:"$M/UnityEngine.dll" -r:"$M/UnityEngine.UI.dll" \
  -r:"$M/Assembly-CSharp-firstpass.dll" -r:"$W/ref/Assembly-CSharp.dll" -out:"$W/Donor.dll" "$HERE/donor/Donor.cs"
dotnet "$W/patcher/Patcher.dll" apply "$M/Assembly-CSharp.dll" "$W/Donor.dll" "$W/Assembly-CSharp.dll"
python3 - "$ORIG" "$W/unsigned.apk" "$W/Assembly-CSharp.dll" <<'PY'
import sys,zipfile
src,dst,dll=sys.argv[1:4]; new=open(dll,'rb').read()
zin=zipfile.ZipFile(src); zout=zipfile.ZipFile(dst,'w')
for i in zin.infolist():
    if i.filename in ('META-INF/MANIFEST.MF','META-INF/CERT.SF','META-INF/CERT.RSA'): continue
    d=new if i.filename=='assets/bin/Data/Managed/Assembly-CSharp.dll' else zin.read(i.filename)
    z=zipfile.ZipInfo(i.filename,date_time=i.date_time); z.compress_type=i.compress_type; z.external_attr=i.external_attr; z.create_system=i.create_system
    zout.writestr(z,d)
zout.close()
PY
openssl pkcs8 -inform DER -nocrypt -in "$PK8" -out "$W/key.pem"
openssl pkcs12 -export -inkey "$W/key.pem" -in "$PEM" -out "$W/test.p12" -name testkey -passout pass:android
cp "$W/unsigned.apk" "$OUT"
jarsigner -keystore "$W/test.p12" -storetype PKCS12 -storepass android -sigalg SHA1withRSA -digestalg SHA1 -sigfile CERT "$OUT" testkey
echo "built $OUT"
