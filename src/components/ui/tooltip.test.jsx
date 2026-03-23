import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

describe("TooltipProvider", () => {
  it("closes the tooltip when the pointer leaves the trigger, even if the tooltip content is hovered", async () => {
    const user = userEvent.setup();

    render(
      <TooltipProvider delayDuration={0}>
        <Tooltip>
          <TooltipTrigger asChild>
            <button type="button">状态</button>
          </TooltipTrigger>
          <TooltipContent>当前 Agent 处于待命状态</TooltipContent>
        </Tooltip>
      </TooltipProvider>,
    );

    await user.hover(screen.getByRole("button", { name: "状态" }));
    const tooltip = await screen.findByRole("tooltip");
    expect(tooltip).toHaveTextContent("当前 Agent 处于待命状态");

    await user.hover(tooltip);

    await user.unhover(screen.getByRole("button", { name: "状态" }));
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });
});
