import { Button } from "@/components/ui/button";
import {
  DropdownIcon,
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function SelectionMenu({ label, items, value, onSelect, emptyText }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={label} className="h-7 w-7">
          <DropdownIcon />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>{label}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {items.length ? (
          items.map((item) => (
            <DropdownMenuCheckboxItem key={item} checked={item === value} onCheckedChange={() => onSelect(item)}>
              {item}
            </DropdownMenuCheckboxItem>
          ))
        ) : (
          <div className="px-2 py-1.5 text-xs text-muted-foreground">{emptyText}</div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
