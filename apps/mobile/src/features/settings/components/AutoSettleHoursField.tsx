import {
  MAX_SIDEBAR_AUTO_SETTLE_AFTER_HOURS,
  MIN_SIDEBAR_AUTO_SETTLE_AFTER_HOURS,
} from "@t3tools/contracts";
import type { ComponentProps } from "react";
import { NumberField } from "../../../components/ui/NumberField";

export type AutoSettleHoursFieldProps = Pick<
  ComponentProps<typeof NumberField>,
  "value" | "onValueChange" | "disabled"
>;

// Every hour of the first day, then whole days: a wheel of all 2,160 hours cannot be scrolled.
const WHEEL_HOURS = [
  ...Array.from({ length: 24 }, (_, index) => index + 1),
  ...Array.from(
    { length: MAX_SIDEBAR_AUTO_SETTLE_AFTER_HOURS / 24 - 1 },
    (_, index) => (index + 2) * 24,
  ),
];

export function AutoSettleHoursField(props: AutoSettleHoursFieldProps) {
  return (
    <NumberField
      {...props}
      min={MIN_SIDEBAR_AUTO_SETTLE_AFTER_HOURS}
      max={MAX_SIDEBAR_AUTO_SETTLE_AFTER_HOURS}
      wheelValues={WHEEL_HOURS}
      label="Hours before auto-settle"
      formatValue={(value) => `${value} ${value === 1 ? "hour" : "hours"}`}
    />
  );
}
