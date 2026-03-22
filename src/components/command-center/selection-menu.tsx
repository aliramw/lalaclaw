import { cloneElement, isValidElement, useCallback, useMemo, useRef, useState } from "react";
import type { FocusEvent, PointerEvent, ReactElement, ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownIcon,
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

type SelectionMenuItem = string | number;

type SelectionMenuProps = {
  children?: ReactNode;
  contentClassName?: string;
  disabled?: boolean;
  emptyText?: ReactNode;
  getItemDescription?: (item: SelectionMenuItem) => ReactNode;
  getItemLabel?: (item: SelectionMenuItem) => ReactNode;
  items?: SelectionMenuItem[];
  label: ReactNode;
  onSelect: (item: SelectionMenuItem) => void;
  renderContent?: (options: {
    handleSelect: (item: SelectionMenuItem) => void;
    suppressTooltip: () => void;
  }) => ReactNode;
  showSelectionIndicator?: boolean;
  tooltipContent?: ReactNode;
  triggerLabel?: string;
  value?: SelectionMenuItem;
};

const SelectionButton = Button as any;
const SelectionTooltip = Tooltip as any;
const SelectionTooltipContent = TooltipContent as any;
const SelectionTooltipTrigger = TooltipTrigger as any;
const SelectionDropdownMenuContent = DropdownMenuContent as any;
const SelectionDropdownMenuLabel = DropdownMenuLabel as any;
const SelectionDropdownMenuSeparator = DropdownMenuSeparator as any;
const SelectionDropdownMenuCheckboxItem = DropdownMenuCheckboxItem as any;
const SelectionDropdownMenuItem = DropdownMenuItem as any;
const SelectionDropdownMenuTrigger = DropdownMenuTrigger as any;

export function SelectionMenu({
  children,
  contentClassName,
  disabled = false,
  emptyText,
  getItemDescription,
  getItemLabel,
  items = [],
  label,
  onSelect,
  renderContent,
  showSelectionIndicator = true,
  tooltipContent,
  triggerLabel,
  value,
}: SelectionMenuProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [contentAlign, setContentAlign] = useState<"start" | "end">("end");
  const [tooltipOpen, setTooltipOpen] = useState(false);
  const [tooltipSuppressed, setTooltipSuppressed] = useState(false);
  const triggerWrapperRef = useRef<HTMLSpanElement | null>(null);

  const clearTooltipSuppression = useCallback(() => {
    setTooltipSuppressed(false);
  }, []);

  const suppressTooltip = useCallback(() => {
    setTooltipOpen(false);
    setTooltipSuppressed(true);
  }, []);

  const handleMenuOpenChange = useCallback((nextOpen: boolean) => {
    if (disabled && nextOpen) {
      setMenuOpen(false);
      return;
    }

    if (nextOpen && typeof window !== "undefined") {
      const triggerRect = triggerWrapperRef.current?.getBoundingClientRect?.();
      const triggerCenterX = triggerRect ? triggerRect.left + (triggerRect.width / 2) : window.innerWidth / 2;
      setContentAlign(triggerCenterX <= window.innerWidth / 2 ? "start" : "end");
    }

    setMenuOpen(nextOpen);
    if (nextOpen) {
      suppressTooltip();
    }
  }, [disabled, suppressTooltip]);

  const handleTooltipOpenChange = useCallback((nextOpen: boolean) => {
    if (menuOpen || tooltipSuppressed) {
      setTooltipOpen(false);
      return;
    }
    setTooltipOpen(nextOpen);
  }, [menuOpen, tooltipSuppressed]);

  const handleSelect = useCallback((item: SelectionMenuItem) => {
    suppressTooltip();
    onSelect(item);
  }, [onSelect, suppressTooltip]);

  const triggerChild = useMemo(() => {
    const triggerProps = {
      disabled,
      onBlur: clearTooltipSuppression,
      onPointerDown: suppressTooltip,
      onPointerLeave: clearTooltipSuppression,
    };

    if (children && isValidElement(children)) {
      return cloneElement(children as ReactElement<any>, {
        disabled: (children as ReactElement<any>).props.disabled ?? disabled,
        onBlur: (event: FocusEvent<HTMLElement>) => {
          (children as ReactElement<any>).props.onBlur?.(event);
          clearTooltipSuppression();
        },
        onPointerDown: (event: PointerEvent<HTMLElement>) => {
          (children as ReactElement<any>).props.onPointerDown?.(event);
          suppressTooltip();
        },
        onPointerLeave: (event: PointerEvent<HTMLElement>) => {
          (children as ReactElement<any>).props.onPointerLeave?.(event);
          clearTooltipSuppression();
        },
      });
    }

    return (
      <SelectionButton variant="ghost" size="icon" aria-label={triggerLabel || String(label)} className="h-7 w-7" {...triggerProps}>
        <DropdownIcon />
      </SelectionButton>
    );
  }, [children, clearTooltipSuppression, disabled, label, suppressTooltip, triggerLabel]);

  return (
    <DropdownMenu onOpenChange={handleMenuOpenChange}>
      <SelectionTooltip open={tooltipOpen} onOpenChange={handleTooltipOpenChange}>
        <SelectionTooltipTrigger asChild>
          <SelectionDropdownMenuTrigger asChild disabled={disabled}>
            <span ref={triggerWrapperRef} className="inline-flex max-w-full">
              {triggerChild}
            </span>
          </SelectionDropdownMenuTrigger>
        </SelectionTooltipTrigger>
        {tooltipContent ? <SelectionTooltipContent side="bottom">{tooltipContent}</SelectionTooltipContent> : null}
      </SelectionTooltip>
      <SelectionDropdownMenuContent align={contentAlign} className={contentClassName} data-align-strategy={contentAlign}>
        <SelectionDropdownMenuLabel>{label}</SelectionDropdownMenuLabel>
        <SelectionDropdownMenuSeparator />
        {renderContent ? renderContent({ handleSelect, suppressTooltip }) : items.length ? (
          items.map((item) => (
            showSelectionIndicator ? (
              <SelectionDropdownMenuCheckboxItem key={item} checked={item === value} onCheckedChange={() => handleSelect(item)}>
                {getItemDescription ? (
                  <div className="grid min-w-[14rem] grid-cols-[5.5rem_minmax(0,1fr)] items-center gap-3">
                    <span className="font-medium">{getItemLabel ? getItemLabel(item) : item}</span>
                    <span className="text-muted-foreground">{getItemDescription(item)}</span>
                  </div>
                ) : (
                  getItemLabel ? getItemLabel(item) : item
                )}
              </SelectionDropdownMenuCheckboxItem>
            ) : (
              <SelectionDropdownMenuItem key={item} onSelect={() => handleSelect(item)}>
                {getItemDescription ? (
                  <div className="grid min-w-[14rem] grid-cols-[5.5rem_minmax(0,1fr)] items-center gap-3">
                    <span className="font-medium">{getItemLabel ? getItemLabel(item) : item}</span>
                    <span className="text-muted-foreground">{getItemDescription(item)}</span>
                  </div>
                ) : (
                  getItemLabel ? getItemLabel(item) : item
                )}
              </SelectionDropdownMenuItem>
            )
          ))
        ) : (
          <div className="px-1 py-1">
            <div className="rounded-md bg-background/70 px-3 py-2.5 text-xs leading-5 text-muted-foreground whitespace-pre-line break-words">
              {emptyText}
            </div>
          </div>
        )}
      </SelectionDropdownMenuContent>
    </DropdownMenu>
  );
}
