import * as React from "react";
import { cn } from "@/lib/utils";

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(({ className, ...props }, ref) => (
  <input
    ref={ref}
    className={cn(
      "flex h-11 w-full border border-border bg-background px-4 py-2 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-brand",
      className
    )}
    {...props}
  />
));
Input.displayName = "Input";

export { Input };
