# Used through -EncodedCommand; file names and handler IDs arrive only as environment data.
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
Add-Type -ReferencedAssemblies System.Drawing -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Imaging;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;

[ComImport, Guid("973810AE-9599-4B88-9E4D-6EE98C9552DA"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IEnumAssocHandlers {
 [PreserveSig] int Next(uint count, out IAssocHandler handler, out uint fetched);
}
[ComImport, Guid("F04061AC-1659-4A3F-A954-775AA57FC083"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IAssocHandler {
 void GetName([MarshalAs(UnmanagedType.LPWStr)] out string name);
 void GetUIName([MarshalAs(UnmanagedType.LPWStr)] out string name);
 void GetIconLocation([MarshalAs(UnmanagedType.LPWStr)] out string path, out int index);
 [PreserveSig] int IsRecommended();
 void MakeDefault([MarshalAs(UnmanagedType.LPWStr)] string description);
 void Invoke(IntPtr data);
 void CreateInvoker(IntPtr data, out IntPtr invoker);
}
[ComImport, Guid("43826D1E-E718-42EE-BC55-A1E261C37BFE"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IShellItem {
 void BindToHandler(IntPtr context, ref Guid handler, ref Guid iid, out IntPtr result);
}
public class FileApp {
 public string id, name, icon;
 public bool isDefault;
}
public static class FileAssociations {
 [DllImport("shell32.dll", CharSet=CharSet.Unicode)]
 static extern int SHAssocEnumHandlers(string extension, uint filter, out IEnumAssocHandlers handlers);
 [DllImport("shell32.dll", CharSet=CharSet.Unicode)]
 static extern int SHCreateItemFromParsingName(string path, IntPtr context, ref Guid iid, out IShellItem item);
 [DllImport("shlwapi.dll", CharSet=CharSet.Unicode)]
 static extern int AssocQueryString(uint flags, uint kind, string association, string extra, StringBuilder output, ref uint length);
 [DllImport("shell32.dll", CharSet=CharSet.Unicode)]
 static extern int SHDefExtractIcon(string file, int index, uint flags, out IntPtr large, out IntPtr small, uint size);
 [DllImport("user32.dll")] static extern bool DestroyIcon(IntPtr icon);
 static string Query(string extension, uint kind) {
  uint length=32768; var result=new StringBuilder((int)length);
  return AssocQueryString(0,kind,extension,null,result,ref length)==0 ? result.ToString() : null;
 }
 static string IconData(IAssocHandler handler) {
  IntPtr large=IntPtr.Zero, small=IntPtr.Zero;
  try {
   string location; int index; handler.GetIconLocation(out location,out index);
   if(String.IsNullOrEmpty(location)) return null;
   location=Environment.ExpandEnvironmentVariables(location);
   // Packaged apps can expose a PNG instead of an executable resource.
   if(File.Exists(location) && (location.EndsWith(".png",StringComparison.OrdinalIgnoreCase) || location.EndsWith(".ico",StringComparison.OrdinalIgnoreCase))) {
    using(var source=Image.FromFile(location)) using(var bitmap=new Bitmap(source,32,32)) using(var stream=new MemoryStream()) {
     bitmap.Save(stream,ImageFormat.Png);return "data:image/png;base64,"+Convert.ToBase64String(stream.ToArray());
    }
   }
   if(SHDefExtractIcon(location,index,0,out large,out small,(16u<<16)|32u)!=0 || large==IntPtr.Zero) return null;
   using(var icon=Icon.FromHandle(large)) using(var bitmap=icon.ToBitmap()) using(var stream=new MemoryStream()) {
    bitmap.Save(stream,ImageFormat.Png);return "data:image/png;base64,"+Convert.ToBase64String(stream.ToArray());
   }
  } catch { return null; }
  finally { if(large!=IntPtr.Zero) DestroyIcon(large); if(small!=IntPtr.Zero) DestroyIcon(small); }
 }
 public static FileApp[] List(string file) {
  string extension=Path.GetExtension(file), executable=Query(extension,2), defaultName=Query(extension,4);
  var result=new List<FileApp>();
  IEnumAssocHandlers handlers; Marshal.ThrowExceptionForHR(SHAssocEnumHandlers(extension,1,out handlers));
  try {
   uint fetched; IAssocHandler handler;
   while(handlers.Next(1,out handler,out fetched)==0 && fetched==1) {
    try {
     string id,name; handler.GetName(out id); handler.GetUIName(out name);
     result.Add(new FileApp { id="windows:"+id,name=name,icon=IconData(handler),isDefault=String.Equals(id,executable,StringComparison.OrdinalIgnoreCase) || (!String.IsNullOrEmpty(defaultName) && String.Equals(name,defaultName,StringComparison.OrdinalIgnoreCase)) });
    } catch { /* A stale association must not hide other applications. */ }
    finally { Marshal.ReleaseComObject(handler); }
   }
  } finally { Marshal.ReleaseComObject(handlers); }
  return result.ToArray();
 }
 public static void Open(string file,string id) {
  IEnumAssocHandlers handlers; Marshal.ThrowExceptionForHR(SHAssocEnumHandlers(Path.GetExtension(file),1,out handlers));
  try {
   uint fetched; IAssocHandler handler;
   while(handlers.Next(1,out handler,out fetched)==0 && fetched==1) {
    try {
     string name; handler.GetName(out name);
     if(!String.Equals("windows:"+name,id,StringComparison.OrdinalIgnoreCase)) continue;
     Guid shellId=new Guid("43826D1E-E718-42EE-BC55-A1E261C37BFE"); IShellItem item;
     Marshal.ThrowExceptionForHR(SHCreateItemFromParsingName(file,IntPtr.Zero,ref shellId,out item));
     IntPtr data=IntPtr.Zero;
     try {
      Guid dataHandler=new Guid("B8C0BD9F-ED24-455C-83E6-D5390C4FE8C4"), dataId=new Guid("0000010E-0000-0000-C000-000000000046");
      item.BindToHandler(IntPtr.Zero,ref dataHandler,ref dataId,out data);handler.Invoke(data);return;
     } finally { if(data!=IntPtr.Zero) Marshal.Release(data);Marshal.ReleaseComObject(item); }
    } finally { Marshal.ReleaseComObject(handler); }
   }
  } finally { Marshal.ReleaseComObject(handlers); }
  throw new InvalidOperationException("Application is no longer associated with this file type.");
 }
}
'@
if ($env:ATELIER_FILE_APP_ACTION -eq 'open') {
 [FileAssociations]::Open($env:ATELIER_FILE_APP_PATH, $env:ATELIER_FILE_APP_ID)
} else {
 $items = @([FileAssociations]::List($env:ATELIER_FILE_APP_PATH))
 ConvertTo-Json -InputObject $items -Compress
}
