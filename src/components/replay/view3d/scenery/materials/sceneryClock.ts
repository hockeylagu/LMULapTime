/**
 * The replay's time in seconds, which every animated surface reads (digital flags blink by it): the scene shell sets it before each
 * frame from the pose the camera follows, so animations pause and scrub with the replay, as the reference animates them by game
 * time.
 */
export const sceneryClock = { value: 0 };
