// Offline ETW analysis. Never prints command lines or arbitrary event payloads.
using System;
using System.IO;
using System.Linq;
using System.Collections.Generic;
using Microsoft.Diagnostics.Tracing;
using Microsoft.Diagnostics.Tracing.Etlx;
using Microsoft.Diagnostics.Tracing.Parsers.Kernel;
using Microsoft.Diagnostics.Symbols;
class NativeWaitTrace {
 static void Main(string[] args) {
  System.Net.ServicePointManager.SecurityProtocol=System.Net.SecurityProtocolType.Tls12;
  File.AppendAllText(args[0]+".analysis-status",DateTime.UtcNow.ToString("o")+" opening\n");
  using(var log=TraceLog.OpenOrConvert(args[0])) {
   File.AppendAllText(args[0]+".analysis-status",DateTime.UtcNow.ToString("o")+" opened\n");
   Console.Error.WriteLine("EventsLost="+log.EventsLost);
   if(args.Length==1) { foreach(var p in log.Processes) if(p.Name.IndexOf("electron",StringComparison.OrdinalIgnoreCase)>=0) Console.WriteLine("{0}\t{1}\t{2:o}\t{3:o}",p.ProcessID,p.Name,p.StartTime.ToUniversalTime(),p.EndTime.ToUniversalTime()); return; }
   var ids=new HashSet<int>(args[1].Split(',').Select(int.Parse));
   var start=DateTimeOffset.FromUnixTimeMilliseconds(long.Parse(args[2])).UtcDateTime;
   var end=DateTimeOffset.FromUnixTimeMilliseconds(long.Parse(args[3])).UtcDateTime;
   using(var reader=new SymbolReader(Console.Error,args[4])) {
    foreach(var m in log.ModuleFiles) if(args[4]!="none" && new[]{"ntdll","win32u","user32","gdi32full","gdi32","dwmapi","dxgi","dxgkrnl","win32kbase","win32kfull","ntoskrnl","kernelbase","kernel32","libglesv2"}.Contains(m.Name.ToLowerInvariant())) { File.AppendAllText(args[0]+".analysis-status",DateTime.UtcNow.ToString("o")+" symbols "+m.Name+"\n");try{ log.CodeAddresses.LookupSymbolsForModule(reader,m); }catch(Exception ex){Console.Error.WriteLine(m.Name+": "+ex.Message);} }
    foreach(var e in log.Events.FilterByTime(start.ToLocalTime(),end.ToLocalTime())) {
     var sw=e as CSwitchTraceData;
     if(!ids.Contains(e.ProcessID) && (sw==null || (!ids.Contains(sw.OldProcessID) && !ids.Contains(sw.NewProcessID)))) continue;
     var stack=e.CallStack(); if(stack==null && sw==null)continue;
     Console.WriteLine("EVENT\t{0:o}\t{1}\tpid={2}\ttid={3}",e.TimeStamp.ToUniversalTime(),e.EventName,e.ProcessID,e.ThreadID);
     if(sw!=null) Console.WriteLine("SWITCH\toldTid={0}\tnewTid={1}\twait={2}\tstate={3}",sw.OldThreadID,sw.NewThreadID,sw.OldThreadWaitReason,sw.OldThreadState);
     for(var frame=stack;frame!=null;frame=frame.Caller)Console.WriteLine("  "+(frame.CodeAddress.ModuleFile==null?"unknown":frame.CodeAddress.ModuleFile.Name)+"!"+frame.CodeAddress.FullMethodName+" @0x"+frame.CodeAddress.Address.ToString("x"));
    }
   }
  }
 }
}
