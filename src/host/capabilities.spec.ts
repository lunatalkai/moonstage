import { describe,it,expect } from 'vitest'
import { allowsStageAction,allowsStagePanel } from './capabilities'
describe('provider capabilities',()=>{
 it('keeps unrestricted hosts compatible',()=>{expect(allowsStageAction(undefined,'rewrite')).toBe(true);expect(allowsStagePanel(undefined,'notepad')).toBe(true)})
 it('restricts a host to its implemented actions and panels',()=>{
  const caps={actions:['copy'],panels:['model','persona','export','bottom']}
  expect(allowsStageAction(caps,'copy')).toBe(true)
  for(const action of ['rewrite','edit','continue','rewind','delete','fork'])expect(allowsStageAction(caps,action)).toBe(false)
  expect(allowsStagePanel(caps,'model')).toBe(true)
  for(const panel of ['notepad','memory','conversations','reset-chat'])expect(allowsStagePanel(caps,panel)).toBe(false)
 })
})
