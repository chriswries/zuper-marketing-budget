import { useState, useEffect, useRef } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { ShieldAlert } from 'lucide-react';

interface AdminOverrideDialogProps {
  open: boolean;
  title: string;
  description: string;
  onCancel: () => void;
  onSubmit: (justification: string) => void;
}

export function AdminOverrideDialog({
  open,
  title,
  description,
  onCancel,
  onSubmit,
}: AdminOverrideDialogProps) {
  const [justification, setJustification] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (open) {
      setJustification('');
      // Focus after dialog animation
      setTimeout(() => textareaRef.current?.focus(), 50);
    }
  }, [open]);

  const handleSubmit = () => {
    if (justification.trim()) {
      onSubmit(justification.trim());
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-amber-500" />
            {title}
          </DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="override-justification">
              Justification <span className="text-destructive">*</span>
            </Label>
            <Textarea
              ref={textareaRef}
              id="override-justification"
              placeholder="Explain why you are using admin override..."
              value={justification}
              onChange={(e) => setJustification(e.target.value)}
              className="min-h-[100px]"
            />
          </div>
        </div>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!justification.trim()}>
            Confirm Override
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
