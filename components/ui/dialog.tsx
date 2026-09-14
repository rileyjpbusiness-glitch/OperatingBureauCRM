"use client";

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";

import { cn } from "@/lib/utils";

const Dialog = DialogPrimitive.Root;
const DialogTrigger = DialogPrimitive.Trigger;
const DialogClose = DialogPrimitive.Close;
const DialogTitle = DialogPrimitive.Title;
const DialogDescription = DialogPrimitive.Description;

function DialogContent({
  className,
  children,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content>) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="data-[state=open]:animate-in data-[state=open]:fade-in-0 fixed inset-0 z-40 bg-black/60" />
      <DialogPrimitive.Content
        className={cn(
          "bg-ground border-hairline rounded-panel data-[state=open]:animate-in data-[state=open]:fade-in-0 fixed top-1/2 left-1/2 z-50 w-full max-w-[var(--dialog-width)] -translate-x-1/2 -translate-y-1/2 border p-4 [animation-duration:var(--duration-settle)] [animation-timing-function:var(--ease-instrument)]",
          className,
        )}
        {...props}
      >
        {children}
        <DialogPrimitive.Close
          aria-label="Close"
          className="motion-fast text-text-3 hover:text-text-1 hover:bg-surface-3 rounded-control absolute top-3 right-3 p-1 outline-none"
        >
          <X className="size-3.5" strokeWidth={1} />
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

export {
  Dialog,
  DialogTrigger,
  DialogClose,
  DialogContent,
  DialogTitle,
  DialogDescription,
};
