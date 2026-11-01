using Mono.Cecil;
using Mono.Cecil.Cil;
using Mono.Cecil.Rocks;

// Usage:
//   Patcher makeref <in.dll> <out.dll>            -> publicised reference copy (+ new fields) for compiling donor code
//   Patcher apply   <in.dll> <donor.dll> <out.dll> -> copy donor method bodies into the original assembly
//
// Donor convention: public static methods in any type of donor.dll named  TargetType__TargetMethod
// whose first parameter is the instance ("self") followed by the target method's parameters.
// Optional "__N" suffix is ignored (allows overload disambiguation by parameter count only).

static class P
{
    // New private instance fields added to existing types (all value types -> no serialization impact, private).
    static readonly (string type, string name, string kind)[] NewFields =
    {
        ("CameraController", "portHasOrigin", "bool"),
        ("CameraController", "portOriginX", "float"),
        ("CameraController", "portOriginY", "float"),
        ("CameraController", "portOriginExpire", "float"),
        ("FatalityManager", "portActiveTime", "float"),
        ("FatalityManager", "portLoggedError", "bool"),
        ("MagicianAquarium", "portTint", "float"),
        ("MagicianAquarium", "portTinting", "bool"),
    };

    static TypeReference Prim(ModuleDefinition m, string k) => k switch
    {
        "bool" => m.TypeSystem.Boolean,
        "float" => m.TypeSystem.Single,
        "int" => m.TypeSystem.Int32,
        "double" => m.TypeSystem.Double,
        _ => throw new Exception("kind " + k)
    };

    static ModuleDefinition Load(string path)
    {
        var resolver = new DefaultAssemblyResolver();
        resolver.AddSearchDirectory(Path.GetDirectoryName(Path.GetFullPath(path)));
        var extra = Environment.GetEnvironmentVariable("MANAGED_DIR");
        if (!string.IsNullOrEmpty(extra)) resolver.AddSearchDirectory(extra);
        return ModuleDefinition.ReadModule(path, new ReaderParameters { AssemblyResolver = resolver, ReadWrite = false });
    }

    static IEnumerable<TypeDefinition> AllTypes(ModuleDefinition m)
    {
        foreach (var t in m.Types)
        {
            yield return t;
            foreach (var n in Nested(t)) yield return n;
        }
    }
    static IEnumerable<TypeDefinition> Nested(TypeDefinition t)
    {
        foreach (var n in t.NestedTypes)
        {
            yield return n;
            foreach (var nn in Nested(n)) yield return nn;
        }
    }

    static void AddFields(ModuleDefinition m, FieldAttributes attrs)
    {
        foreach (var (type, name, kind) in NewFields)
        {
            var td = m.Types.First(t => t.Name == type && t.Namespace == "");
            if (td.Fields.Any(f => f.Name == name)) continue;
            td.Fields.Add(new FieldDefinition(name, attrs, Prim(m, kind)));
        }
    }

    static int Main(string[] args)
    {
        if (args[0] == "makeref")
        {
            var m = Load(args[1]);
            foreach (var t in AllTypes(m))
            {
                if (t.IsNested) t.Attributes = (t.Attributes & ~TypeAttributes.VisibilityMask) | TypeAttributes.NestedPublic;
                else t.Attributes = (t.Attributes & ~TypeAttributes.VisibilityMask) | TypeAttributes.Public;
                foreach (var f in t.Fields) f.Attributes = (f.Attributes & ~FieldAttributes.FieldAccessMask) | FieldAttributes.Public;
                foreach (var me in t.Methods) me.Attributes = (me.Attributes & ~MethodAttributes.MemberAccessMask) | MethodAttributes.Public;
            }
            AddFields(m, FieldAttributes.Public);
            foreach (var (type, name) in NewVoidMethods)
            {
                var td = m.Types.First(t => t.Name == type && t.Namespace == "");
                if (td.Methods.Any(x => x.Name == name)) continue;
                var md = new MethodDefinition(name, MethodAttributes.Public | MethodAttributes.HideBySig, m.TypeSystem.Void);
                var il = md.Body.GetILProcessor();
                il.Emit(OpCodes.Ret);
                td.Methods.Add(md);
            }
            m.Write(args[2]);
            Console.WriteLine("ref written");
            return 0;
        }
        if (args[0] == "apply")
        {
            var target = Load(args[1]);
            var donor = Load(args[2]);
            AddFields(target, FieldAttributes.Private);
            var cloner = new Cloner(target);
            int applied = 0;
            foreach (var dt in donor.Types)
            {
                foreach (var dm in dt.Methods.Where(x => x.IsStatic && x.HasBody && x.Name.Contains("__")).OrderBy(x => x.Name.StartsWith("NEW") ? 0 : 1).ToList())
                {
                    var dname = dm.Name;
                    bool isOvr = dname.StartsWith("NEWOVR_");
                    bool isNew = dname.StartsWith("NEW_") || isOvr;
                    if (isOvr) dname = dname.Substring(7); else if (isNew) dname = dname.Substring(4);
                    var parts = dname.Split(new[] { "__" }, StringSplitOptions.None);
                    var tType = target.Types.FirstOrDefault(t => t.Name == parts[0] && t.Namespace == "");
                    if (tType == null) throw new Exception("target type not found: " + parts[0]);
                    if (isNew)
                    {
                        var nm = new MethodDefinition(parts[1], isOvr ? (MethodAttributes.Family | MethodAttributes.HideBySig | MethodAttributes.Virtual) : (MethodAttributes.Public | MethodAttributes.HideBySig), cloner.MapType(dm.ReturnType));
                        for (int pi = 1; pi < dm.Parameters.Count; pi++) nm.Parameters.Add(new ParameterDefinition(dm.Parameters[pi].Name, ParameterAttributes.None, cloner.MapType(dm.Parameters[pi].ParameterType)));
                        tType.Methods.Add(nm);
                        cloner.ReplaceBody(nm, dm);
                        applied++;
                        Console.WriteLine($"added {tType.Name}::{nm.Name}");
                        continue;
                    }
                    var cands = tType.Methods.Where(x => x.Name == parts[1] && x.Parameters.Count == dm.Parameters.Count - 1 && !x.IsStatic).ToList();
                    if (cands.Count != 1) throw new Exception($"target method resolution failed for {dm.Name}: {cands.Count} candidates");
                    var tm = cands[0];
                    cloner.ReplaceBody(tm, dm);
                    applied++;
                    Console.WriteLine($"patched {tType.Name}::{tm.Name}");
                }
            }
            // Extra string patches (ldstr operand swaps)
            foreach (var (typeName, methodName, oldStr, newStr) in StringPatches)
            {
                var tt = target.Types.First(t => t.Name == typeName && t.Namespace == "");
                var mm = tt.Methods.First(x => x.Name == methodName);
                int n = 0;
                foreach (var ins in mm.Body.Instructions)
                    if (ins.OpCode == OpCodes.Ldstr && (string)ins.Operand == oldStr) { ins.Operand = newStr; n++; }
                if (n == 0) throw new Exception($"string patch not applied {typeName}.{methodName} '{oldStr}'");
                Console.WriteLine($"string patch {typeName}::{methodName} '{oldStr}' -> '{newStr}' x{n}");
                applied++;
            }
            target.Write(args[3]);
            Console.WriteLine($"done, {applied} patches");
            return 0;
        }
        return 1;
    }

    static readonly (string type, string name)[] NewVoidMethods =
    {
    };

    static readonly (string type, string method, string oldS, string newS)[] StringPatches =
    {
        ("ObjectsSpawner", "get_BeforeTrySelectedCharacterNameType", "Try_Character", "Try_Character_NameType"),
    };
}

class Cloner
{
    readonly ModuleDefinition T;
    public Cloner(ModuleDefinition t) { T = t; }

    bool IsSelf(TypeReference t)
    {
        var s = t.Scope;
        if (s is AssemblyNameReference an) return an.Name == T.Assembly.Name.Name;
        if (s is ModuleDefinition md) return md.Assembly.Name.Name == T.Assembly.Name.Name;
        return false;
    }

    TypeDefinition FindType(string fullName)
    {
        // Cecil FullName uses '/' for nested
        var parts = fullName.Split('/');
        TypeDefinition cur = T.Types.FirstOrDefault(t => (t.Namespace.Length > 0 ? t.Namespace + "." : "") + t.Name == parts[0]);
        for (int i = 1; cur != null && i < parts.Length; i++) cur = cur.NestedTypes.FirstOrDefault(n => n.Name == parts[i]);
        if (cur == null) throw new Exception("type not found in target: " + fullName);
        return cur;
    }

    public TypeReference MapType(TypeReference t)
    {
        switch (t)
        {
            case GenericParameter gp: return gp;
            case GenericInstanceType g:
                {
                    var ng = new GenericInstanceType(MapType(g.ElementType));
                    foreach (var a in g.GenericArguments) ng.GenericArguments.Add(MapType(a));
                    return ng;
                }
            case ArrayType a: return new ArrayType(MapType(a.ElementType), a.Rank);
            case ByReferenceType b: return new ByReferenceType(MapType(b.ElementType));
            case PointerType p: return new PointerType(MapType(p.ElementType));
            case RequiredModifierType: case OptionalModifierType: case PinnedType: case SentinelType:
                return T.ImportReference(t);
        }
        if (IsSelf(t)) return FindType(t.FullName);
        return T.ImportReference(t);
    }

    static string Sig(MethodReference m) => string.Join(",", m.Parameters.Select(p => p.ParameterType.FullName));

    public MethodReference MapMethod(MethodReference m)
    {
        if (m is GenericInstanceMethod gim)
        {
            var ng = new GenericInstanceMethod(MapMethod(gim.ElementMethod));
            foreach (var a in gim.GenericArguments) ng.GenericArguments.Add(MapType(a));
            return ng;
        }
        var decl = MapType(m.DeclaringType);
        if (decl is TypeDefinition td)
        {
            var found = td.Methods.FirstOrDefault(x => x.Name == m.Name && x.Parameters.Count == m.Parameters.Count && Sig(x) == Sig(m));
            if (found == null) throw new Exception("method not found in target: " + m.FullName);
            return found;
        }
        var mr = new MethodReference(m.Name, MapType(m.ReturnType), decl)
        {
            HasThis = m.HasThis,
            ExplicitThis = m.ExplicitThis,
            CallingConvention = m.CallingConvention
        };
        foreach (var gp in m.GenericParameters) mr.GenericParameters.Add(new GenericParameter(gp.Name, mr));
        foreach (var p in m.Parameters) mr.Parameters.Add(new ParameterDefinition(MapType(p.ParameterType)));
        return mr;
    }

    public FieldReference MapField(FieldReference f)
    {
        var decl = MapType(f.DeclaringType);
        if (decl is TypeDefinition td)
        {
            var found = td.Fields.FirstOrDefault(x => x.Name == f.Name);
            if (found == null) throw new Exception("field not found in target: " + f.FullName);
            return found;
        }
        return new FieldReference(f.Name, MapType(f.FieldType), decl);
    }

    public void ReplaceBody(MethodDefinition target, MethodDefinition donor)
    {
        var old = target.Body;
        var body = new MethodBody(target);
        body.InitLocals = true;
        body.MaxStackSize = Math.Max(donor.Body.MaxStackSize, 8);
        var varMap = new Dictionary<VariableDefinition, VariableDefinition>();
        foreach (var v in donor.Body.Variables)
        {
            var nv = new VariableDefinition(MapType(v.VariableType));
            body.Variables.Add(nv);
            varMap[v] = nv;
        }
        var insMap = new Dictionary<Instruction, Instruction>();
        var il = body.GetILProcessor();
        foreach (var ins in donor.Body.Instructions)
        {
            var ni = Instruction.Create(OpCodes.Nop);
            ni.OpCode = ins.OpCode;
            insMap[ins] = ni;
        }
        foreach (var ins in donor.Body.Instructions)
        {
            var ni = insMap[ins];
            object op = ins.Operand;
            switch (op)
            {
                case null: ni.Operand = null; break;
                case Instruction t: ni.Operand = insMap[t]; break;
                case Instruction[] ts: ni.Operand = ts.Select(x => insMap[x]).ToArray(); break;
                case VariableDefinition v: ni.Operand = varMap[v]; break;
                case ParameterDefinition p:
                    {
                        int idx = donor.Parameters.IndexOf(p); // 0 == self
                        if (idx == 0) ni.Operand = body.ThisParameter;
                        else ni.Operand = target.Parameters[idx - 1];
                        break;
                    }
                case MethodReference mr: ni.Operand = MapMethod(mr); break;
                case FieldReference fr: ni.Operand = MapField(fr); break;
                case TypeReference tr: ni.Operand = MapType(tr); break;
                case CallSite cs: throw new Exception("callsite unsupported");
                default: ni.Operand = op; break; // primitives, strings
            }
            body.Instructions.Add(ni);
        }
        foreach (var eh in donor.Body.ExceptionHandlers)
        {
            var neh = new ExceptionHandler(eh.HandlerType)
            {
                TryStart = eh.TryStart == null ? null : insMap[eh.TryStart],
                TryEnd = eh.TryEnd == null ? null : insMap[eh.TryEnd],
                HandlerStart = eh.HandlerStart == null ? null : insMap[eh.HandlerStart],
                HandlerEnd = eh.HandlerEnd == null ? null : insMap[eh.HandlerEnd],
                FilterStart = eh.FilterStart == null ? null : insMap[eh.FilterStart],
                CatchType = eh.CatchType == null ? null : MapType(eh.CatchType)
            };
            body.ExceptionHandlers.Add(neh);
        }
        target.Body = body;
        // Instruction.Create(OpCodes.Nop) then OpCode swap leaves operand types as-is; make sure short/long forms are consistent
        body.OptimizeMacros();
    }
}
