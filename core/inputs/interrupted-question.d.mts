type Message={id?:string;role?:string;text?:string;formSubmissionId?:string;inputDeliveryState?:string;inputRecord?:{state:string}};
export function interruptedQuestion<T extends Message>(messages:T[],currentMessageId?:string):T|undefined;
