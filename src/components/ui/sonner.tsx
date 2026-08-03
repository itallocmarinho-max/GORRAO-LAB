import { Toaster as Sonner } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      className="toaster group cyber-toaster"
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg",
          description: "group-[.toast]:text-muted-foreground",
          actionButton: "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton: "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
          success:
            "group-[.toaster]:border-[#39FF14] group-[.toaster]:bg-black/80 group-[.toaster]:text-[#39FF14] group-[.toaster]:shadow-[0_0_30px_rgba(57,255,20,0.35)]",
          error:
            "group-[.toaster]:border-red-500 group-[.toaster]:bg-black/80 group-[.toaster]:text-red-500 group-[.toaster]:shadow-[0_0_30px_rgba(239,68,68,0.35)]",
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
