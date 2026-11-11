import {Component,type ReactNode} from 'react';
import {Alert,AlertTitle,AlertDescription} from './components/ui/alert';
import {Button} from './components/ui/button';
import RunDiagnosticsButton from './RunDiagnosticsButton';
import {t} from './i18n';

// A broken transcript must not unmount the sidebar or stop host-owned work.
export default class RenderErrorBoundary extends Component<{children:ReactNode;runId?:string},{failed:boolean}> {
 state={failed:false};
 static getDerivedStateFromError(){return {failed:true};}
 render(){
  if(!this.state.failed)return this.props.children;
  return <div className="flex flex-col gap-3 p-4" role="region" aria-label={t('显示异常')}>
   <Alert variant="destructive"><AlertTitle>{t('内容暂时无法显示')}</AlertTitle><AlertDescription>{t('显示异常不代表任务已停止。请先查看任务状态，避免重复执行命令。')}</AlertDescription></Alert>
   <Button variant="outline" onClick={()=>this.setState({failed:false})}>{t('重新显示')}</Button>
   {this.props.runId&&<RunDiagnosticsButton runId={this.props.runId}/>}
  </div>;
 }
}
