/** The artwork already includes the name. Pass `decorative` when a parent link has its own label. */
const SIZE_CLASS = {
  nav: "brand-logo",
  hero: "brand-logo brand-logo-hero",
  mark: "brand-logo brand-logo-mark",
} as const;

export function BrandLogo({
  size = "nav",
  decorative = false,
}: {
  size?: keyof typeof SIZE_CLASS;
  decorative?: boolean;
}) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src="/logo.png" alt={decorative ? "" : "NYAY-SUTRA"} className={SIZE_CLASS[size]} />
  );
}
