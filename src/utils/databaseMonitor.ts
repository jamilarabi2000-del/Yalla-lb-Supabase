export type OperationStatus='PENDING'|'SUCCESS'|'FAILED';
export type FirestoreOpType='GET_DOC'|'SET_DOC'|'UPDATE_DOC'|'DELETE_DOC'|'BATCH_COMMIT'|'SNAPSHOT_SYNC'|'QUERY'|'DIAGNOSTIC_PING';
export interface FirestoreLogRecord{id:string;timestamp:string;isoTimestamp:string;epochMs:number;operation:FirestoreOpType;collection:string;documentId:string;path:string;caller:string;status:OperationStatus;latencyMs?:number;payload?:any;diff?:Record<string,{before:any;after:any}>;errorMessage?:string;errorCode?:string;errorStack?:string;metadata?:Record<string,any>}
export interface SyncDiagnosticsSummary{totalOperations:number;totalReads:number;totalWrites:number;successfulWrites:number;failedWrites:number;writeSuccessRate:number;avgLatencyMs:number;lastSuccessfulSync:string|null;lastFailedSync:string|null;lastError:string|null;activeMonitoredPaths:string[]}
const logs:FirestoreLogRecord[]=[];
export const redactPII=(data:any):any=>{if(!data||typeof data!=='object')return data;if(Array.isArray(data))return data.map(redactPII);const copy={...data};for(const k of ['email','phone','address','fullName','firstName','lastName','shipping','profile','user'])if(k in copy)copy[k]='[REDACTED_PII]';return copy};
export const sanitizeDocumentData=redactPII;
export const dbMonitor={getLogs:()=>[...logs],clearLogs:()=>{logs.length=0},subscribe:(_fn:(record:FirestoreLogRecord,allLogs:FirestoreLogRecord[])=>void)=>()=>{},getSummary:():SyncDiagnosticsSummary=>({totalOperations:logs.length,totalReads:0,totalWrites:0,successfulWrites:0,failedWrites:0,writeSuccessRate:100,avgLatencyMs:0,lastSuccessfulSync:null,lastFailedSync:null,lastError:null,activeMonitoredPaths:[]})};
export const monitoredSetDoc=async(..._args:any[])=>undefined;
export const monitoredGetDoc=async(..._args:any[])=>null;
export const monitoredUpdateDoc=async(..._args:any[])=>undefined;
export const monitoredDeleteDoc=async(..._args:any[])=>undefined;
