import { Toaster as Sonner } from "sonner";

export function Toaster() {
  return (
    <Sonner
      theme="dark"
      position="bottom-right"
      closeButton
      toastOptions={{
        classNames: {
          toast:
            "group toast !rounded-xl !border !border-border !bg-card !text-foreground !shadow-[0_18px_60px_rgba(0,0,0,0.5)]",
          description: "!text-muted-foreground",
          actionButton: "!bg-primary !text-primary-foreground",
          cancelButton: "!bg-secondary !text-secondary-foreground",
          closeButton: "!bg-secondary !text-secondary-foreground !border-border",
        },
      }}
    />
  );
}
