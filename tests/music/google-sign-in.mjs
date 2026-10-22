// @ts-check
/** Install the Google SDK protocol used by the local authentication service. */
export async function installGoogleSignIn(context, credential = 'fixture-owner') {
  await context.route('https://accounts.google.com/gsi/client', route => route.fulfill({contentType:'application/javascript',body:`globalThis.google={accounts:{id:{initialize(options){this.options=options},renderButton(host,options){const button=document.createElement('button');button.setAttribute('aria-label','Sign in with Google');button.textContent=options.type==='icon'?'G':'Sign in with Google';if(options.type==='icon'){button.style.cssText='width:30px;height:30px;padding:0;display:grid;place-items:center'}button.onclick=()=>{options.click_listener();this.options.callback({credential:${JSON.stringify(credential)},state:options.state})};host.replaceChildren(button)},disableAutoSelect(){},cancel(){}}}};`}));
}
