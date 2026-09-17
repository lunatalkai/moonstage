import {readFileSync} from 'node:fs'
import {describe,it,expect,vi} from 'vitest'
import ts from 'typescript'
import path from 'node:path'
const chat=readFileSync(path.resolve(__dirname,'../canvas.vue'),'utf8')
const take=(start:string,end:string)=>chat.slice(chat.indexOf(start),chat.indexOf(end,chat.indexOf(start)))

describe('unaccepted rejection feedback',()=>{
 it('restores the draft and inserts one error with its operation metadata',()=>{
  const pending:any={socketToken:1,userBubbleId:1,aiBubbleId:2,draft:'Synthetic draft',preAdmissionErrorType:'insufficient_credits'}
  const talkList={value:[{id:1},{id:2}]}
  const content={value:''}
  const bubbles=vi.fn((_type,_msg,metadata)=>talkList.value.push({id:3,...metadata}))
  const scope:any={pendingChatTurn:pending,talkList,content,chatTransport:{shouldRecoverTransientTurn:()=>true},
   messageQueue:{value:[]},tempContent:{value:''},replyContent:{value:''},thinkingContent:{value:''},
   rewrite:{value:false},contine:{value:false},clearStreamState:vi.fn(),appendChatErrorBubble:bubbles,
   resolveChatErrorMessage:()=> 'Insufficient credits',t:(s:string)=>s,message:{warning:vi.fn()},
   createPreAdmissionOperationErrorProjection:()=>({clientOperationId:'synthetic-rejection'}),
   operationStatusPollScheduler:{cancel:vi.fn()},operationStatusRequestKey:'',durableAckProbeKey:'',
   discardPendingChatOperationCandidate:vi.fn(),pendingResendPayload:{value:null},removeOrphanPlaceholder:vi.fn(),closeWebSocket:vi.fn()}
  const source=take('function recoverPendingChatTurnBeforeAccepted(', 'function markPendingChatTurnAccepted(')
   +take('function settleConfirmedPreAdmissionFailure(', 'function settleFrozenLegacyStreamError(')
   +'\nreturn settleConfirmedPreAdmissionFailure(pendingChatTurn, "Synthetic draft");'
  const js=ts.transpile(source,{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None})
  expect(new Function(...Object.keys(scope),js)(...Object.values(scope))).toBe(true)
  expect(content.value).toBe('Synthetic draft')
  expect(bubbles).toHaveBeenCalledTimes(1)
  expect(bubbles).toHaveBeenCalledWith('insufficient_credits','Insufficient credits',{clientOperationId:'synthetic-rejection'})
  expect(scope.closeWebSocket).toHaveBeenCalledOnce()
 })
})
