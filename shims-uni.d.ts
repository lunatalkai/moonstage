/// <reference types='@dcloudio/types' />
import 'vue'

declare module '*?raw' {
  const content: string
  export default content
}

declare module '*?inline' {
  const content: string
  export default content
}

declare module '@vue/runtime-core' {
  type Hooks = App.AppInstance & Page.PageInstance;

  interface ComponentCustomOptions extends Hooks {

  }
}
