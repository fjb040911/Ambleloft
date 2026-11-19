using System;
using System.ComponentModel;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;

// StdIO is passed through unchanged. A non-inheritable Job handle owns the
// engine tree, including background Git children. JOB_LIST applies membership
// during CreateProcess, before engine code can spawn an unowned descendant.
class WindowsProcessHost {
 [StructLayout(LayoutKind.Sequential)] struct Limits {public long ProcessTime,JobTime;public uint Flags;public UIntPtr MinWorking,MaxWorking;public uint Active;public UIntPtr Affinity;public uint Priority,Scheduling;}
 [StructLayout(LayoutKind.Sequential)] struct IO {public ulong ReadOps,WriteOps,OtherOps,ReadBytes,WriteBytes,OtherBytes;}
 [StructLayout(LayoutKind.Sequential)] struct ExtendedLimits {public Limits Basic;public IO Io;public UIntPtr ProcessMemory,JobMemory,PeakProcess,PeakJob;}
 [StructLayout(LayoutKind.Sequential,CharSet=CharSet.Unicode)] struct Startup {public int Size;public string Reserved,Desktop,Title;public uint X,Y,Width,Height,CharsX,CharsY,Fill,Flags;public ushort Show,ReservedSize;public IntPtr ReservedBytes,Input,Output,Error;}
 [StructLayout(LayoutKind.Sequential)] struct StartupEx {public Startup Startup;public IntPtr Attributes;}
 [StructLayout(LayoutKind.Sequential)] struct ProcessInfo {public IntPtr Process,Thread;public uint Pid,Tid;}
 [DllImport("kernel32.dll",SetLastError=true,CharSet=CharSet.Unicode)] static extern IntPtr CreateJobObject(IntPtr a,string name);
 [DllImport("kernel32.dll",SetLastError=true)] static extern bool SetInformationJobObject(IntPtr job,int info,ref ExtendedLimits limits,uint size);
 [DllImport("kernel32.dll",SetLastError=true)] static extern bool InitializeProcThreadAttributeList(IntPtr list,int count,int flags,ref IntPtr size);
 [DllImport("kernel32.dll",SetLastError=true)] static extern bool UpdateProcThreadAttribute(IntPtr list,uint flags,IntPtr attribute,IntPtr value,IntPtr size,IntPtr previous,IntPtr returned);
 [DllImport("kernel32.dll")] static extern void DeleteProcThreadAttributeList(IntPtr list);
 [DllImport("kernel32.dll",SetLastError=true,CharSet=CharSet.Unicode)] static extern bool CreateProcess(string app,StringBuilder command,IntPtr processAttributes,IntPtr threadAttributes,bool inherit,uint flags,IntPtr environment,string cwd,ref StartupEx startup,out ProcessInfo process);
 [DllImport("kernel32.dll",SetLastError=true)] static extern IntPtr OpenProcess(uint access,bool inherit,uint pid);
 [DllImport("kernel32.dll")] static extern IntPtr GetStdHandle(int kind);
 [DllImport("kernel32.dll",SetLastError=true)] static extern uint WaitForMultipleObjects(uint count,IntPtr[] handles,bool all,uint timeout);
 [DllImport("kernel32.dll",SetLastError=true)] static extern bool GetExitCodeProcess(IntPtr process,out uint code);
 [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr handle);
 [DllImport("kernel32.dll",SetLastError=true)] static extern bool TerminateJobObject(IntPtr job,uint code);
 [DllImport("kernel32.dll",SetLastError=true)] static extern bool QueryInformationJobObject(IntPtr job,int info,IntPtr data,uint size,IntPtr returned);
 static void Drain(IntPtr job){Check(TerminateJobObject(job,1));IntPtr data=Marshal.AllocHGlobal(48);try{for(int i=0;i<1000;i++){Check(QueryInformationJobObject(job,1,data,48,IntPtr.Zero));if(Marshal.ReadInt32(data,40)==0)return;Thread.Sleep(10);}throw new TimeoutException("job termination");}finally{Marshal.FreeHGlobal(data);}}
 static void Check(bool success){if(!success)throw new Win32Exception(Marshal.GetLastWin32Error());}
 static string Quote(string value){var b=new StringBuilder("\"");int slashes=0;foreach(char c in value){if(c=='\\'){slashes++;continue;}if(c=='"'){b.Append('\\',slashes*2+1);b.Append(c);}else{b.Append('\\',slashes);b.Append(c);}slashes=0;}b.Append('\\',slashes*2);return b.Append('"').ToString();}
 static int Main(string[] args){
  if(args.Length==2&&args[0]=="--stop"){for(int i=0;i<500;i++){try{using(var signal=EventWaitHandle.OpenExisting("Local\\Ambleloft-engine-"+args[1])){signal.Set();return 0;}}catch(WaitHandleCannotBeOpenedException){Thread.Sleep(10);}}return 126;}
  EventWaitHandle stop=null;
  IntPtr job=IntPtr.Zero,owner=IntPtr.Zero,list=IntPtr.Zero,jobList=IntPtr.Zero;ProcessInfo process=new ProcessInfo();bool initialized=false;
  try{if(args.Length<3)throw new ArgumentException("owner and executable required");uint ownerPid;if(!UInt32.TryParse(args[0],out ownerPid)||ownerPid==0)throw new ArgumentException("invalid owner");
   stop=new EventWaitHandle(false,EventResetMode.ManualReset,"Local\\Ambleloft-engine-"+args[1]);
   owner=OpenProcess(0x00100000,false,ownerPid);Check(owner!=IntPtr.Zero);job=CreateJobObject(IntPtr.Zero,null);Check(job!=IntPtr.Zero);
   var limits=new ExtendedLimits();limits.Basic.Flags=0x2000;Check(SetInformationJobObject(job,9,ref limits,(uint)Marshal.SizeOf(limits)));
   IntPtr size=IntPtr.Zero;InitializeProcThreadAttributeList(IntPtr.Zero,1,0,ref size);list=Marshal.AllocHGlobal(size);Check(InitializeProcThreadAttributeList(list,1,0,ref size));initialized=true;
   jobList=Marshal.AllocHGlobal(IntPtr.Size);Marshal.WriteIntPtr(jobList,job);Check(UpdateProcThreadAttribute(list,0,new IntPtr(0x0002000D),jobList,new IntPtr(IntPtr.Size),IntPtr.Zero,IntPtr.Zero));
   var startup=new StartupEx();startup.Startup.Size=Marshal.SizeOf(startup);startup.Startup.Flags=0x100;startup.Startup.Input=GetStdHandle(-10);startup.Startup.Output=GetStdHandle(-11);startup.Startup.Error=GetStdHandle(-12);startup.Attributes=list;
   var command=new StringBuilder();for(int i=2;i<args.Length;i++){if(i>2)command.Append(' ');command.Append(Quote(args[i]));}
   Check(CreateProcess(args[2],command,IntPtr.Zero,IntPtr.Zero,true,0x00080000|0x08000000,IntPtr.Zero,null,ref startup,out process));
   uint outcome=WaitForMultipleObjects(3,new IntPtr[]{process.Process,owner,stop.SafeWaitHandle.DangerousGetHandle()},false,0xffffffff);if(outcome==0){uint code;Check(GetExitCodeProcess(process.Process,out code));Drain(job);return unchecked((int)code);}if(outcome==1||outcome==2){Drain(job);return 1;}throw new Win32Exception(Marshal.GetLastWin32Error());
  }catch(Exception e){Console.Error.WriteLine("ENGINE_JOB_HOST_FAILED: "+e.GetType().Name+" "+(e is Win32Exception?((Win32Exception)e).NativeErrorCode.ToString():"invalid launch"));return 126;}
  finally{if(stop!=null)stop.Dispose();if(job!=IntPtr.Zero)CloseHandle(job);if(process.Thread!=IntPtr.Zero)CloseHandle(process.Thread);if(process.Process!=IntPtr.Zero)CloseHandle(process.Process);if(owner!=IntPtr.Zero)CloseHandle(owner);if(initialized)DeleteProcThreadAttributeList(list);if(list!=IntPtr.Zero)Marshal.FreeHGlobal(list);if(jobList!=IntPtr.Zero)Marshal.FreeHGlobal(jobList);}
 }
}
