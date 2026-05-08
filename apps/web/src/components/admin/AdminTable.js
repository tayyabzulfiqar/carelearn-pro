export default function AdminTable({ columns = [], rows = [], keyField = 'id' }) {
  return (
    <div className="surface-card overflow-hidden">
      <table className="w-full text-left text-sm">
        <thead className="bg-gray-50">
          <tr>
            {columns.map((column) => (
              <th key={column.key} className="px-4 py-3 font-semibold text-gray-600">
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row[keyField]} className="border-t border-gray-100">
              {columns.map((column) => (
                <td key={column.key} className="px-4 py-3 text-gray-700">
                  {typeof column.render === 'function' ? column.render(row) : row[column.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}