const loading=document.getElementById('loading');
const errorPanel=document.getElementById('error');
const errorText=document.getElementById('errorText');
function showError(error){
  loading.style.display='none';
  errorText.textContent=error instanceof Error?error.message:String(error);
  errorPanel.style.display='flex';
  console.error('[TDEF] Scene initialization failed:',error);
}
import('./scene.js').then(()=>{
  loading.style.display='none';
  console.info('[TDEF] Babylon.js scene initialized');
}).catch(showError);
