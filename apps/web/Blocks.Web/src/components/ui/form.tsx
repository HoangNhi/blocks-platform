import * as React from "react"

import { cn } from "@/lib/utils"

function Form({
  className,
  ...props
}: React.ComponentProps<"form">) {
  return <form data-slot="form" className={cn("grid gap-4", className)} {...props} />
}

function FormItem({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="form-item"
      className={cn("grid gap-2", className)}
      {...props}
    />
  )
}

function FormLabel({
  className,
  ...props
}: React.ComponentProps<"label">) {
  return (
    <label
      data-slot="form-label"
      className={cn("text-sm font-medium text-foreground", className)}
      {...props}
    />
  )
}

function FormControl({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return <div data-slot="form-control" className={cn(className)} {...props} />
}

function FormDescription({
  className,
  ...props
}: React.ComponentProps<"p">) {
  return (
    <p
      data-slot="form-description"
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  )
}

function FormMessage({
  className,
  ...props
}: React.ComponentProps<"p">) {
  return (
    <p
      data-slot="form-message"
      className={cn("text-sm text-destructive", className)}
      {...props}
    />
  )
}

export {
  Form,
  FormControl,
  FormDescription,
  FormItem,
  FormLabel,
  FormMessage,
}
