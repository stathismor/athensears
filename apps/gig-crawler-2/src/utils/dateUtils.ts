export function parseFlexibleDate(dateStr: string): Date | null {
  if (!dateStr) return null;

  // Try ISO format
  const isoDate = new Date(dateStr);
  if (!isNaN(isoDate.getTime())) {
    return isoDate;
  }

  // Try common formats
  const formats = [
    /^(\d{4})-(\d{2})-(\d{2})$/, // YYYY-MM-DD
    /^(\d{2})\/(\d{2})\/(\d{4})$/, // DD/MM/YYYY
    /^(\d{2})-(\d{2})-(\d{4})$/, // DD-MM-YYYY
  ];

  for (const format of formats) {
    const match = dateStr.match(format);
    if (match) {
      if (format.source.startsWith("^(\\d{4})")) {
        // YYYY-MM-DD
        return new Date(
          parseInt(match[1]),
          parseInt(match[2]) - 1,
          parseInt(match[3])
        );
      } else {
        // DD/MM/YYYY or DD-MM-YYYY
        return new Date(
          parseInt(match[3]),
          parseInt(match[2]) - 1,
          parseInt(match[1])
        );
      }
    }
  }

  return null;
}

export function getDateRangeQuery(daysAhead: number = 30): string {
  const today = new Date();
  const future = new Date(today);
  future.setDate(future.getDate() + daysAhead);

  const formatMonth = (date: Date) => {
    return date.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  };

  if (today.getMonth() === future.getMonth()) {
    return formatMonth(today);
  } else {
    const startMonth = today.toLocaleDateString("en-US", { month: "long" });
    const endMonthYear = formatMonth(future);
    return `${startMonth}-${endMonthYear}`;
  }
}

export function formatDateForStrapi(date: Date): string {
  return date.toISOString();
}
