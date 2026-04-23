import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva("inline-flex items-center border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.24em]", {
  variants: {
    variant: {
      default: "border-border bg-brand-muted text-foreground",
      signal: "border-brand bg-brand text-brand-foreground",
      warning: "border-warning bg-warning text-warning-foreground",
      muted: "border-border bg-transparent text-muted-foreground",
    },
  },
  defaultVariants: {
    variant: "default",
  },
});

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}
