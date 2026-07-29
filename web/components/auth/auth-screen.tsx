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

  return (
    <div className="grid min-h-dvh lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <main className="flex flex-col justify-center px-8 py-16 sm:px-14">
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
            onSubmit={(e) => {
              e.preventDefault();
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
              label="Email"
              type="email"
              required
              value={email}
              autoComplete="email"
              onChange={(e) => setEmail(e.target.value)}
            />

            <Field
              label="Password"
              type="password"
              required
              value={password}
              autoComplete={registering ? "new-password" : "current-password"}
              hint={registering ? "At least 8 characters" : undefined}
              onChange={(e) => setPassword(e.target.value)}
            />

            {/* One message from the server, so it sits with the form rather
                than being pinned to whichever field we guessed was at fault. */}
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

      <Specimen />
    </div>
  );
}

/**
 * Not a feature grid and not a screenshot. The atomic unit of this product is
 * the moment — a speaker, a timestamp, a quote you can play — so the way to
 * show what Raven is, is to show one.
 */
function Specimen() {
  return (
    <aside
      aria-label="What Raven keeps"
      className="relative hidden overflow-hidden bg-paper lg:block"
    >
      {/* Never fully opaque. The paint holds 90% at the outer edge and thins
          to 60% toward the middle of the screen, so paper shows through and
          the image reads as printed on the page rather than laid over it.
          No stop reaches transparent: a ramp to zero turned the dark trees
          translucent over cream, and that pale strip beside the opaque trees
          read as a light leak down the seam. A plate in a book has an edge. */}
      <Image
        src="/auth-panel.jpg"
        alt=""
        fill
        priority
        sizes="55vw"
        className="object-cover object-top [mask-image:linear-gradient(to_right,rgba(0,0,0,0.6)_0%,rgba(0,0,0,0.75)_50%,rgba(0,0,0,0.9)_100%)]"
      />

      {/* A caption on a plate, not a showcase. The form is the job on this
          screen; a display-sized pull quote competed with it. */}
      {/* No type on the panel. Thinned to 60–90% the forest composites to a
          mid-tone, which is the one ground nothing sits on — too dark for ink,
          too light for cream, measured between 1.0:1 and 3.3:1 either way.
          The panel is atmosphere; the form is the screen's only job. The
          specimen moment belongs on a surface with room for it. */}
    </aside>
  );
}
