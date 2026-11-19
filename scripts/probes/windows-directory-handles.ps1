param([Parameter(Mandatory=$true)][string]$Target)
$resolvedTarget = [IO.Path]::GetFullPath($Target).TrimEnd('\')
# Read-only handle inventory. Only duplicated handles in this process are closed.
Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;
public class DirectoryHandles {
 [DllImport("ntdll.dll")] static extern int NtQuerySystemInformation(int c,IntPtr b,int n,out int needed);
 [DllImport("kernel32.dll")] static extern IntPtr OpenProcess(uint access,bool inherit,int pid);
 [DllImport("kernel32.dll")] static extern IntPtr GetCurrentProcess();
 [DllImport("kernel32.dll")] static extern bool DuplicateHandle(IntPtr source,IntPtr handle,IntPtr target,out IntPtr result,uint access,bool inherit,uint options);
 [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr h);
 [DllImport("kernel32.dll")] static extern uint GetFileType(IntPtr h);
 [DllImport("kernel32.dll",CharSet=CharSet.Unicode)] static extern uint GetFinalPathNameByHandle(IntPtr h,StringBuilder b,uint size,uint flags);
 public static string[] Find(string target) {
  int size=1048576,needed;IntPtr buffer;int status;
  while(true){buffer=Marshal.AllocHGlobal(size);status=NtQuerySystemInformation(64,buffer,size,out needed);if(status==0)break;Marshal.FreeHGlobal(buffer);if(status!=unchecked((int)0xc0000004))throw new Exception("NtQuerySystemInformation: "+status);size=Math.Max(size*2,needed+65536);}
  var matches=new List<string>();var processes=new Dictionary<int,IntPtr>();
  try{long count=Marshal.ReadInt64(buffer);for(long i=0;i<count;i++){
   IntPtr entry=IntPtr.Add(buffer,checked(16+(int)i*40));int pid=checked((int)Marshal.ReadInt64(entry,8));
   if(!processes.ContainsKey(pid))processes[pid]=OpenProcess(0x40,false,pid);IntPtr process=processes[pid];if(process==IntPtr.Zero)continue;
   IntPtr copy;if(!DuplicateHandle(process,new IntPtr(Marshal.ReadInt64(entry,16)),GetCurrentProcess(),out copy,0,false,2))continue;
   try{if(GetFileType(copy)!=1)continue;var name=new StringBuilder(32768);uint n=GetFinalPathNameByHandle(copy,name,(uint)name.Capacity,0);if(n==0||n>=name.Capacity)continue;string path=name.ToString();if(path.StartsWith(@"\\?\"))path=path.Substring(4);if(path.Equals(target,StringComparison.OrdinalIgnoreCase)||path.StartsWith(target+@"\",StringComparison.OrdinalIgnoreCase))matches.Add(pid+"\t"+Marshal.ReadInt64(entry,16)+"\t"+path);}
   finally{CloseHandle(copy);}
  }}finally{foreach(var p in processes.Values)if(p!=IntPtr.Zero)CloseHandle(p);Marshal.FreeHGlobal(buffer);}
  return matches.ToArray();
 }
}
'@
[DirectoryHandles]::Find($resolvedTarget)
