import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva("inline-flex items-center border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.24em]", {
  variants: {
    variant: {
      default: "border-border bg-[#e5ddd0] text-foreground",
      signal: "border-[#1d3a32] bg-[#1d3a32] text-[#f4efe6]",
      warning: "border-[#9a3412] bg-[#9a3412] text-[#f4efe6]",
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
