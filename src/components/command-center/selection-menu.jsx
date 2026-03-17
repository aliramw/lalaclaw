import { cloneElement, isValidElement, useCallback, useMemo, useState } from "react";
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
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [tooltipOpen, setTooltipOpen] = useState(false);
  const [tooltipSuppressed, setTooltipSuppressed] = useState(false);

  const clearTooltipSuppression = useCallback(() => {
    setTooltipSuppressed(false);
  }, []);

  const suppressTooltip = useCallback(() => {
    setTooltipOpen(false);
    setTooltipSuppressed(true);
  }, []);

  const handleMenuOpenChange = useCallback((nextOpen) => {
    if (disabled && nextOpen) {
      setMenuOpen(false);
      return;
    }
    setMenuOpen(nextOpen);
    if (nextOpen) {
      suppressTooltip();
    }
  }, [disabled, suppressTooltip]);

  const handleTooltipOpenChange = useCallback((nextOpen) => {
    if (menuOpen || tooltipSuppressed) {
      setTooltipOpen(false);
      return;
    }
    setTooltipOpen(nextOpen);
  }, [menuOpen, tooltipSuppressed]);

  const handleSelect = useCallback((item) => {
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
      return cloneElement(children, {
        disabled: children.props.disabled ?? disabled,
        onBlur: (event) => {
          children.props.onBlur?.(event);
          clearTooltipSuppression();
        },
        onPointerDown: (event) => {
          children.props.onPointerDown?.(event);
          suppressTooltip();
        },
        onPointerLeave: (event) => {
          children.props.onPointerLeave?.(event);
          clearTooltipSuppression();
        },
      });
    }

    return (
      <Button variant="ghost" size="icon" aria-label={triggerLabel || label} className="h-7 w-7" {...triggerProps}>
        <DropdownIcon />
      </Button>
    );
  }, [children, clearTooltipSuppression, label, suppressTooltip, triggerLabel]);

  return (
    <DropdownMenu onOpenChange={handleMenuOpenChange}>
      <Tooltip open={tooltipOpen} onOpenChange={handleTooltipOpenChange}>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild disabled={disabled}>{triggerChild}</DropdownMenuTrigger>
        </TooltipTrigger>
        {tooltipContent ? <TooltipContent side="bottom">{tooltipContent}</TooltipContent> : null}
      </Tooltip>
      <DropdownMenuContent align="end" className={contentClassName}>
        <DropdownMenuLabel>{label}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {renderContent ? renderContent({ handleSelect, suppressTooltip }) : items.length ? (
          items.map((item) => (
            showSelectionIndicator ? (
              <DropdownMenuCheckboxItem key={item} checked={item === value} onCheckedChange={() => handleSelect(item)}>
                {getItemDescription ? (
                  <div className="grid min-w-[14rem] grid-cols-[5.5rem_minmax(0,1fr)] items-center gap-3">
                    <span className="font-medium">{getItemLabel ? getItemLabel(item) : item}</span>
                    <span className="text-muted-foreground">{getItemDescription(item)}</span>
                  </div>
                ) : (
                  getItemLabel ? getItemLabel(item) : item
                )}
              </DropdownMenuCheckboxItem>
            ) : (
              <DropdownMenuItem key={item} onSelect={() => handleSelect(item)}>
                {getItemDescription ? (
                  <div className="grid min-w-[14rem] grid-cols-[5.5rem_minmax(0,1fr)] items-center gap-3">
                    <span className="font-medium">{getItemLabel ? getItemLabel(item) : item}</span>
                    <span className="text-muted-foreground">{getItemDescription(item)}</span>
                  </div>
                ) : (
                  getItemLabel ? getItemLabel(item) : item
                )}
              </DropdownMenuItem>
            )
          ))
        ) : (
          <div className="px-1 py-1">
            <div className="rounded-md bg-background/70 px-3 py-2.5 text-xs leading-5 text-muted-foreground whitespace-pre-line break-words">
              {emptyText}
            </div>
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
