export default (date: Date): string => {
  const now = new Date();
  const secondsPast = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (secondsPast < 60) return "Just now";

  const minutes = Math.floor(secondsPast / 60);
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} ${days === 1 ? "day" : "days"} ago`;

  const weeks = Math.floor(days / 7);
  if (days < 30) return `${weeks} ${weeks === 1 ? "week" : "weeks"} ago`;

  const months = Math.floor(days / 30);
  if (days < 365) return `${months} ${months === 1 ? "month" : "months"} ago`;

  const years = Math.floor(days / 365);
  return `${years} ${years === 1 ? "year" : "years"} ago`;
};
