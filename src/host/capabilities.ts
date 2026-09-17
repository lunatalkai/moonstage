/** Optional host limits. Absent lists preserve the complete legacy player. */
export interface StageCapabilities {
 actions?: readonly string[]
 panels?: readonly string[]
 personaModes?: readonly string[]
 assist?: boolean
 preferences?: boolean
 agentMode?: boolean
}
export const allowsStageAction=(caps:StageCapabilities|undefined,key:string)=>caps?.actions==null||caps.actions.includes(key)
export const allowsStagePanel=(caps:StageCapabilities|undefined,key:string)=>caps?.panels==null||caps.panels.includes(key)
