export function SectionHeading({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <div className="flex flex-col gap-3">
      <span className="font-mono text-xs uppercase tracking-[0.28em] text-muted-foreground">{eyebrow}</span>
      <h2 className="max-w-3xl font-serif text-3xl leading-tight md:text-5xl">{title}</h2>
      <p className="max-w-2xl text-sm leading-6 text-muted-foreground md:text-base md:leading-7">{description}</p>
    </div>
  );
}
