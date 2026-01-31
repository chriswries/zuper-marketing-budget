import { useState, useRef, useEffect, KeyboardEvent } from 'react';
import { TableCell } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

interface EditableCellProps {
  value: number;
  formatted: string;
  onSave: (newValue: number) => void;
  className?: string;
}

export function EditableCell({ value, formatted, onSave, className }: EditableCellProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [inputValue, setInputValue] = useState(value.toString());
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const handleClick = () => {
    setInputValue(value.toString());
    setIsEditing(true);
  };

  const handleSave = () => {
    setIsEditing(false);
    const parsed = parseFloat(inputValue);
    // Clamp negatives to 0, treat NaN/empty as 0
    const newValue = isNaN(parsed) ? 0 : Math.max(0, parsed);
    if (newValue !== value) {
      onSave(newValue);
    }
  };

  const handleCancel = () => {
    setIsEditing(false);
    setInputValue(value.toString());
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleSave();
    } else if (e.key === 'Escape') {
      handleCancel();
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Allow digits, decimal point, and empty string
    const val = e.target.value;
    if (val === '' || /^[0-9]*\.?[0-9]*$/.test(val)) {
      setInputValue(val);
    }
  };

  if (isEditing) {
    return (
      <TableCell className={cn("relative z-0 text-right p-0 bg-background group-hover:bg-muted", className)}>
        <Input
          ref={inputRef}
          type="text"
          inputMode="decimal"
          value={inputValue}
          onChange={handleChange}
          onBlur={handleSave}
          onKeyDown={handleKeyDown}
          className="h-8 w-full text-right text-sm border-primary focus-visible:ring-1"
        />
      </TableCell>
    );
  }

  return (
    <TableCell
      className={cn(
        "relative z-0 text-right tabular-nums cursor-pointer bg-background group-hover:bg-muted hover:bg-muted transition-colors",
        className
      )}
      onClick={handleClick}
    >
      {formatted}
    </TableCell>
  );
}
