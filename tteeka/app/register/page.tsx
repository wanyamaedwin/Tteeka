'use client'

import Link from 'next/link'
import {
  ArrowRight,
  Building2,
  Eye,
  EyeOff,
  LockKeyhole,
  Phone,
  UserRound,
} from 'lucide-react'
import { FormEvent, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ApiError } from '@/lib/api/errors'
import { login } from '@/lib/api/auth'
import { registerMerchant } from '@/lib/api/onboarding'
import { setMockUser } from '@/lib/api/mock-auth'
import { isMockMode } from '@/lib/config'
import { useAuth } from '@/components/auth-provider'
import { MockModeBadge } from '@/components/mock-mode-badge'

const inputClass =
  'h-11 w-full rounded-lg border border-input bg-background pl-10 pr-3 text-sm outline-none ring-offset-background transition focus:border-primary focus:ring-2 focus:ring-primary/20'

export default function RegisterPage() {
  const router = useRouter()
  const { setUser, refresh } = useAuth()
  const key = useRef(crypto.randomUUID())
  const errorRef = useRef<HTMLParagraphElement>(null)
  const [form, setForm] = useState({
    name: '',
    phone: '',
    password: '',
    confirmPassword: '',
    businessName: '',
  })
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [created, setCreated] = useState(false)
  const update = (field: keyof typeof form, value: string) =>
    setForm((current) => ({ ...current, [field]: value }))

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    if (form.password.length < 8) {
      setError('Use at least 8 characters for your password.')
      queueMicrotask(() => errorRef.current?.focus())
      return
    }
    if (form.password !== form.confirmPassword) {
      setError('Your passwords do not match.')
      queueMicrotask(() => errorRef.current?.focus())
      return
    }
    setLoading(true)
    try {
      if (isMockMode()) {
        setUser(setMockUser())
        router.replace('/app')
        return
      }
      await registerMerchant(
        {
          name: form.name.trim(),
          phone: form.phone.trim(),
          password: form.password,
          businessName: form.businessName.trim(),
        },
        key.current,
      )
      setCreated(true)
      try {
        const user = await login({
          phone: form.phone.trim(),
          password: form.password,
        })
        setUser(user)
        await refresh()
        router.replace('/app')
      } catch {
        setError('Your account was created. Sign in to continue.')
        queueMicrotask(() => errorRef.current?.focus())
      }
    } catch (cause) {
      const apiError = cause instanceof ApiError ? cause : null
      setError(
        apiError?.status === 409 && apiError.message.includes('phone number')
          ? 'An account with this phone number already exists.'
          : apiError?.status === 409
            ? 'This registration was already submitted with different information. Refresh the page to start again.'
            : apiError?.isNetworkError
              ? 'We couldn’t reach Tteeka. Check your connection and try again.'
              : apiError?.status === 400
                ? 'Check your details and try again.'
                : 'We couldn’t create your account right now. Please try again.',
      )
      queueMicrotask(() => errorRef.current?.focus())
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="flex min-h-screen w-full items-center justify-center bg-background px-5 py-10">
      <div
        className="min-w-0 w-full max-w-md flex-1"
        style={{ flexBasis: 0, minWidth: 0, width: '100%' }}
      >
        <Link href="/login" className="mb-9 flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-xl bg-primary font-serif text-xl font-bold text-primary-foreground">
            T
          </span>
          <span className="font-serif text-3xl font-bold tracking-tight">
            tteeka
          </span>
        </Link>
        <div className="mb-7">
          <div className="mb-3 flex items-center gap-2">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
              Get started
            </p>
            <MockModeBadge />
          </div>
          <h1 className="font-serif text-4xl font-bold tracking-tight">
            Create your Tteeka account
          </h1>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            Set up your business workspace and start managing WhatsApp orders in
            one place.
          </p>
        </div>
        <form
          onSubmit={submit}
          aria-describedby={error ? 'registration-error' : undefined}
          className="flex min-w-0 flex-col gap-4 rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6"
        >
          <Field
            id="name"
            label="Your name"
            icon={<UserRound className="size-4" />}
          >
            <input
              id="name"
              name="name"
              autoComplete="name"
              required
              maxLength={160}
              value={form.name}
              onChange={(event) => update('name', event.target.value)}
              className={inputClass}
              placeholder="Your full name"
            />
          </Field>
          <Field
            id="phone"
            label="Phone number"
            hint="Use 07XXXXXXXX or +2567XXXXXXXX"
            icon={<Phone className="size-4" />}
          >
            <input
              id="phone"
              name="phone"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              required
              maxLength={64}
              value={form.phone}
              onChange={(event) => update('phone', event.target.value)}
              className={inputClass}
              placeholder="07XXXXXXXX"
            />
          </Field>
          <Field
            id="businessName"
            label="Business name"
            icon={<Building2 className="size-4" />}
          >
            <input
              id="businessName"
              name="businessName"
              autoComplete="organization"
              required
              maxLength={160}
              value={form.businessName}
              onChange={(event) => update('businessName', event.target.value)}
              className={inputClass}
              placeholder="Your business"
            />
          </Field>
          <PasswordField
            id="password"
            label="Password"
            value={form.password}
            show={showPassword}
            onChange={(value) => update('password', value)}
            onToggle={() => setShowPassword((value) => !value)}
          />
          <PasswordField
            id="confirmPassword"
            label="Confirm password"
            value={form.confirmPassword}
            show={showPassword}
            onChange={(value) => update('confirmPassword', value)}
            onToggle={() => setShowPassword((value) => !value)}
          />
          {error && (
            <p
              ref={errorRef}
              id="registration-error"
              tabIndex={-1}
              role="alert"
              className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive outline-none"
            >
              {error}{' '}
              {created && (
                <Link href="/login" className="font-semibold underline">
                  Sign in
                </Link>
              )}
              {!created && error.includes('already exists') && (
                <>
                  {' '}
                  <Link href="/login" className="font-semibold underline">
                    Sign in
                  </Link>
                </>
              )}
            </p>
          )}
          <button
            type="submit"
            disabled={loading}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? 'Creating account…' : 'Create account'}
            {!loading && <ArrowRight className="size-4" />}
          </button>
        </form>
        <p className="mt-5 text-center text-sm text-muted-foreground">
          Already have an account?{' '}
          <Link
            href="/login"
            className="font-semibold text-primary underline-offset-4 hover:underline"
          >
            Sign in
          </Link>
        </p>
      </div>
    </main>
  )
}

function Field({
  id,
  label,
  hint,
  icon,
  children,
}: {
  id: string
  label: string
  hint?: string
  icon: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <label
      className="flex min-w-0 flex-col gap-2 text-sm font-semibold"
      htmlFor={id}
    >
      {label}
      <div className="relative min-w-0">
        <span className="pointer-events-none absolute left-3 top-3 text-muted-foreground">
          {icon}
        </span>
        {children}
      </div>
      {hint && (
        <span className="text-xs font-normal text-muted-foreground">
          {hint}
        </span>
      )}
    </label>
  )
}

function PasswordField({
  id,
  label,
  value,
  show,
  onChange,
  onToggle,
}: {
  id: string
  label: string
  value: string
  show: boolean
  onChange: (value: string) => void
  onToggle: () => void
}) {
  return (
    <label
      className="flex min-w-0 flex-col gap-2 text-sm font-semibold"
      htmlFor={id}
    >
      {label}
      <div className="relative min-w-0">
        <LockKeyhole className="pointer-events-none absolute left-3 top-3 size-4 text-muted-foreground" />
        <input
          id={id}
          name={id}
          type={show ? 'text' : 'password'}
          autoComplete="new-password"
          required
          minLength={8}
          maxLength={1024}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className={`${inputClass} pr-11`}
        />
        <button
          type="button"
          aria-label={
            show ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`
          }
          onClick={onToggle}
          className="absolute right-1.5 top-1.5 grid size-8 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </button>
      </div>
    </label>
  )
}
