/** A term with its explanation on hover: a dotted underline says there is one. */
export function Term({ explanation, children }: { explanation: string; children: string }) {
  return <span title={explanation} className="cursor-help underline decoration-dotted decoration-lmu-rule-strong underline-offset-2">{children}</span>;
}
