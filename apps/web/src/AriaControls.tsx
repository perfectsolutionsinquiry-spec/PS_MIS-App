import type { CSSProperties, ReactNode } from "react";
import {
  Checkbox,
  Button,
  Input,
  ListBox,
  ListBoxItem,
  Popover,
  Select,
  SelectValue,
  TextArea,
  TextField,
} from "react-aria-components";
import { Cell, Column, Row, Table, TableBody, TableHeader } from "react-aria-components/Table";

export function AriaDataTable({
  headers,
  rows,
  emptyLabel = "No data yet.",
}: {
  headers: string[];
  rows: Array<Array<ReactNode>>;
  emptyLabel?: string;
}) {
  const columns = headers.map((header, index) => ({ id: `column-${index}`, header }));
  return (
    <Table aria-label="Data table" style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.82rem" }}>
      <TableHeader columns={columns}>
        {(column) => <Column id={column.id} isRowHeader={column.id === "column-0"}>{column.header}</Column>}
      </TableHeader>
      <TableBody items={rows.map((cells, index) => ({ id: `row-${index}`, cells }))}>
        {(row) => (
          <Row id={row.id}>
            {row.cells.map((cell, index) => <Cell key={`${row.id}-${index}`}>{cell}</Cell>)}
          </Row>
        )}
      </TableBody>
    </Table>
  );
}

export function AriaTextField({
  value,
  onChange,
  style,
  ...props
}: {
  value: string;
  onChange: (value: string) => void;
  style?: CSSProperties;
  type?: string;
  placeholder?: string;
  "aria-label"?: string;
  autoFocus?: boolean;
  onKeyDown?: React.KeyboardEventHandler<HTMLInputElement>;
}) {
  return (
    <TextField value={value} onChange={onChange} style={{ display: "contents" }}>
      <Input {...props} style={style} />
    </TextField>
  );
}

export function AriaTextArea({
  value,
  onChange,
  style,
  ...props
}: {
  value: string;
  onChange: (value: string) => void;
  style?: CSSProperties;
  rows?: number;
  "aria-label"?: string;
}) {
  return (
    <TextField value={value} onChange={onChange} style={{ display: "contents" }}>
      <TextArea {...props} style={style} />
    </TextField>
  );
}

export function AriaSelect({
  value,
  onChange,
  options,
  style,
  placeholder,
  ariaLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
  style?: CSSProperties;
  placeholder?: string;
  ariaLabel: string;
}) {
  return (
    <Select
      selectedKey={value || null}
      onSelectionChange={(key) => onChange(key == null ? "" : String(key))}
      aria-label={ariaLabel}
      style={{ display: "contents" }}
    >
      <ButtonLike style={style}>
        <SelectValue>{({ selectedText }) => selectedText || placeholder || ""}</SelectValue>
      </ButtonLike>
      <Popover>
        <ListBox>
          {options.map((option) => (
            <ListBoxItem key={option.value} id={option.value} textValue={option.label}>
              {option.label}
            </ListBoxItem>
          ))}
        </ListBox>
      </Popover>
    </Select>
  );
}

function ButtonLike({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <Button type="button" style={{ ...style, textAlign: "left" }}>
      {children}
    </Button>
  );
}

export function AriaCheckbox({
  isSelected,
  onChange,
  children,
}: {
  isSelected: boolean;
  onChange: (selected: boolean) => void;
  children: ReactNode;
}) {
  return (
    <Checkbox isSelected={isSelected} onChange={onChange}>
      {({ isSelected: selected }) => (
        <>
          <span aria-hidden="true" style={{ display: "inline-flex", width: 15, height: 15, border: "1px solid #94a3b8", borderRadius: 3, alignItems: "center", justifyContent: "center", background: selected ? "#2563eb" : "white", color: "white", fontSize: "0.7rem" }}>
            {selected ? "✓" : ""}
          </span>
          {children}
        </>
      )}
    </Checkbox>
  );
}
