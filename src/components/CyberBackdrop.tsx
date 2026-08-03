import fundoVerbaCury from "@/assets/fundo_verba_cury.png";

export function CyberBackdrop() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 z-0 overflow-hidden bg-black"
    >
      <img
        src={fundoVerbaCury}
        alt=""
        className="absolute top-0 left-[-50%] w-[150%] h-auto object-contain object-top max-w-none"
      />
      <div className="absolute inset-0 bg-black/40" />
    </div>
  );
}
