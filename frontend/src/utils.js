const formatTo12Hour = (timeString) => {
  // Create a Date object from the timestamp
  const date = new Date(timeString);

  // Get hours and minutes
  let hours = date.getHours();
  let minutes = date.getMinutes();

  // Determine AM/PM
  const ampm = hours >= 12 ? "PM" : "AM";

  // Convert to 12-hour format
  hours = hours % 12;
  hours = hours ? hours : 12; // if 0, make it 12

  // Pad minutes to 2 digits
  minutes = minutes < 10 ? "0" + minutes : minutes;

  // Return formatted time
  return `${hours}:${minutes} ${ampm}`;
};
export default formatTo12Hour;
