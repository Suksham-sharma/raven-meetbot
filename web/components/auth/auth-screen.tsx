"use client";

import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api";
import { keys } from "@/lib/queries";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";

type FieldErrors = { email?: string; password?: string };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validate({
  email,
  password,
  registering,
}: {
  email: string;
  password: string;
  registering: boolean;
}): FieldErrors {
  const found: FieldErrors = {};

  if (!email.trim()) found.email = "Enter your email address.";
  else if (!EMAIL.test(email.trim()))
    found.email = "That doesn't look like an email address.";

  if (!password) found.password = "Enter your password.";
  else if (registering && password.length < 8)
    found.password = "Use at least 8 characters.";

  return found;
}

export function AuthScreen({ mode }: { mode: "login" | "register" }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [name, setName] = React.useState("");

  const registering = mode === "register";

  const submit = useMutation({
    mutationFn: () =>
      registering
        ? api.register(email, password, name || undefined)
        : api.login(email, password),
    onSuccess: (data) => {
      queryClient.setQueryData(keys.session, data);
      router.replace("/");
    },
  });

  const error =
    submit.error instanceof ApiError
      ? submit.error.message
      : submit.error
        ? "Something went wrong. Try again."
        : undefined;

  const [fieldErrors, setFieldErrors] = React.useState<FieldErrors>({});
  const emailRef = React.useRef<HTMLInputElement>(null);
  const passwordRef = React.useRef<HTMLInputElement>(null);

  const clear = (key: keyof FieldErrors) =>
    setFieldErrors((prev) => (prev[key] ? { ...prev, [key]: undefined } : prev));

  return (
    <div className="relative grid min-h-dvh bg-rail lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <Grain />
      {/* Lifted out of grid flow so the plate can reach left of the column
          boundary; `main` then falls into column one on its own. */}
      <Specimen />

      <main className="relative z-10 flex flex-col justify-center px-8 py-16 sm:px-14">
        <div className="mx-auto w-full max-w-[360px]">
          <Link href="/" className="mb-10 flex items-center gap-2.5">
            <span className="size-2 rounded-full bg-accent" />
            <span className="font-serif text-[20px] font-medium tracking-[-0.02em]">
              Raven
            </span>
          </Link>

          <h1 className="mb-1.5 font-serif text-[32px] leading-[1.12] font-normal tracking-[-0.018em] text-balance">
            {registering ? "Start remembering" : "Welcome back"}
          </h1>
          <p className="mb-8 text-[14px] text-ink-2">
            {registering
              ? "Raven joins your calls, then keeps what was said."
              : "Pick up where your meetings left off."}
          </p>

          <form
            className="flex flex-col gap-4"
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              const found = validate({ email, password, registering });
              setFieldErrors(found);
              const first = found.email
                ? emailRef
                : found.password
                  ? passwordRef
                  : null;
              if (first) {
                first.current?.focus();
                return;
              }
              submit.mutate();
            }}
          >
            {registering && (
              <Field
                label="Name"
                value={name}
                autoComplete="name"
                onChange={(e) => setName(e.target.value)}
              />
            )}

            <Field
              ref={emailRef}
              label="Email"
              type="email"
              required
              value={email}
              autoComplete="email"
              error={fieldErrors.email}
              onChange={(e) => {
                setEmail(e.target.value);
                clear("email");
              }}
            />

            <Field
              ref={passwordRef}
              label="Password"
              type="password"
              required
              value={password}
              autoComplete={registering ? "new-password" : "current-password"}
              hint={registering ? "At least 8 characters" : undefined}
              error={fieldErrors.password}
              onChange={(e) => {
                setPassword(e.target.value);
                clear("password");
              }}
            />

            {error && (
              <p role="alert" className="text-[13px] text-live">
                {error}
              </p>
            )}

            <Button
              type="submit"
              variant="primary"
              size="lg"
              loading={submit.isPending}
              className="mt-1"
            >
              {registering ? "Create account" : "Sign in"}
            </Button>
          </form>

          <p className="mt-6 text-[13.5px] text-ink-3">
            {registering ? "Already have an account?" : "No account yet?"}{" "}
            <Link
              href={registering ? "/login" : "/register"}
              className="font-medium text-accent hover:underline"
            >
              {registering ? "Sign in" : "Make one"}
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}

const PANEL = "/auth-panel-a.jpg";

const GRAIN =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='180' height='180'%3E%3Cfilter id='p'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='3' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='180' height='180' filter='url(%23p)'/%3E%3C/svg%3E\")";

function Grain() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0"
      style={{ backgroundImage: GRAIN, opacity: 0.02 }}
    />
  );
}

function Specimen() {
  return (
    <aside
      aria-label="What Raven keeps"
      className="pointer-events-none absolute inset-y-0 right-0 left-[43%] hidden lg:block"
    >
      <Image
        src={PANEL}
        alt=""
        fill
        priority
        quality={92}
        sizes="60vw"
        className="object-cover object-top"
      />
    </aside>
  );
}
