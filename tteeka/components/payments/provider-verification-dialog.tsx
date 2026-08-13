'use client'
import { useEffect,useRef } from 'react'
import { ShieldCheck,X } from 'lucide-react'
import type { PaymentTransaction } from '@/lib/api/payments'

const providerName=(method:PaymentTransaction['method'])=>method==='MTN_MOMO'?'MTN MoMo':'Airtel Money'

export function ProviderVerificationDialog({open,payment,pending,error,onClose,onConfirm}:{open:boolean;payment:PaymentTransaction|null;pending:boolean;error:string;onClose:()=>void;onConfirm:()=>void}){
  const cancelRef=useRef<HTMLButtonElement>(null)
  useEffect(()=>{if(open)cancelRef.current?.focus()},[open])
  useEffect(()=>{if(!open)return;const escape=(event:KeyboardEvent)=>{if(event.key==='Escape'&&!pending)onClose()};document.addEventListener('keydown',escape);return()=>document.removeEventListener('keydown',escape)},[open,pending,onClose])
  if(!open||!payment)return null
  const provider=providerName(payment.method)
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4" role="presentation" onMouseDown={event=>{if(event.currentTarget===event.target&&!pending)onClose()}}><div role="dialog" aria-modal="true" aria-labelledby="provider-check-title" aria-describedby="provider-check-description" className="w-full max-w-md rounded-2xl border border-border bg-background p-6 shadow-xl"><div className="flex items-start justify-between gap-4"><div className="flex items-start gap-3"><span className="rounded-full bg-secondary p-2"><ShieldCheck className="size-5"/></span><div><h2 id="provider-check-title" className="font-serif text-xl font-bold">Check this payment with {provider}?</h2><p id="provider-check-description" className="mt-2 text-sm text-muted-foreground">Tteeka will ask the provider whether the reported payment details match. This check may verify the payment, return no match, or be unavailable.</p></div></div><button type="button" aria-label="Close" disabled={pending} onClick={onClose}><X className="size-5"/></button></div>{error&&<p role="alert" className="mt-4 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}<div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><button ref={cancelRef} type="button" disabled={pending} onClick={onClose} className="h-10 rounded-lg border border-border px-4 text-sm font-semibold">Cancel</button><button type="button" disabled={pending} aria-busy={pending} onClick={onConfirm} className="h-10 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-60">{pending?'Checking with provider…':'Check with Provider'}</button></div></div></div>
}
