'use client';

export default function AdminFilterBar({
  search,
  onSearchChange,
  filters = [],
  actions = null,
}) {
  return (
    <div className="surface-card mb-4 flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between">
      <div className="flex flex-1 flex-col gap-3 md:flex-row md:items-center">
        <input
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          className="field-input md:max-w-sm"
          placeholder="Search..."
        />
        <div className="flex flex-wrap gap-2">
          {filters.map((filter) => (
            <select
              key={filter.key}
              value={filter.value}
              onChange={(e) => filter.onChange(e.target.value)}
              className="field-input min-w-[160px]"
            >
              {filter.options.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          ))}
        </div>
      </div>
      {actions ? <div className="flex gap-2">{actions}</div> : null}
    </div>
  );
}