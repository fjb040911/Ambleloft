import FormFields,{type FormValues} from './FormFields';
import type {PersistentInputRequest} from './types';

// Controlled fields only. Draft ownership, autosave and beginEdit belong to the
// persistent dock controller (U6), never to a virtualized history row.
export default function InputRequestFields({request,values,onChange,errors={},disabled=false}:{request:PersistentInputRequest;values:FormValues;onChange(name:string,value:string|boolean):void;errors?:Record<string,string>;disabled?:boolean}){
 return <FormFields fields={request.template.steps[0].fields} values={values} change={onChange} errors={errors} locked={disabled||request.state!=='pending'||request.sourceInvalid}/>;
}
