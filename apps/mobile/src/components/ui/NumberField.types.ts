export interface NumberFieldProps {
  readonly label: string;
  readonly min: number;
  readonly max: number;
  /** Replaces every integer from min to max in the iOS wheel when that range is too long to scroll. */
  readonly wheelValues?: ReadonlyArray<number>;
  readonly formatValue?: (value: number) => string;
  readonly value: number;
  readonly onValueChange: (value: number) => void;
  readonly disabled?: boolean;
}
