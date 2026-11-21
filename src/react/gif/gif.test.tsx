import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import {
  FakeIntersectionObserver,
  setTabHidden,
  stubIntersectionObserver,
  stubReducedMotion,
} from "../../../tests/helpers/dom.ts";
import { Gif, type GifLoadState } from "./index.ts";

function stubMediaPlayback(): {
  play: ReturnType<typeof vi.fn>;
  pause: ReturnType<typeof vi.fn>;
} {
  const play = vi.fn(() => Promise.resolve());
  const pause = vi.fn();
  vi.spyOn(HTMLMediaElement.prototype, "play").mockImplementation(play);
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(pause);
  return { play, pause };
}

function mustSelect<T extends Element>(container: ParentNode, selector: string): T {
  const found = container.querySelector<T>(selector);
  if (!found) {
    throw new Error(`Expected element matching ${selector}`);
  }
  return found;
}

describe("<Gif />", () => {
  test("lazy-mounts video on intersection, sets muted + webkit-playsinline, and plays when ready", () => {
    stubIntersectionObserver();
    stubReducedMotion(false);
    const { play, pause } = stubMediaPlayback();
    const states: GifLoadState[] = [];
    const onDuration = vi.fn();

    const { container } = render(
      <Gif
        src="https://example.com/clip.mp4"
        poster="https://example.com/poster.png"
        label="Offline animation"
        onDurationChange={onDuration}
        onLoadStateChange={(state) => states.push(state)}
      />,
    );

    const root = screen.getByRole("img", { name: "Offline animation" });
    expect(root.getAttribute("data-part")).toBe("gif");
    expect(root.getAttribute("data-state")).toBe("idle");
    expect(container.querySelector("video")).toBeNull();

    // Enter viewport: mounts video and starts playing when canplay fires.
    act(() => {
      FakeIntersectionObserver.last().enter(root);
    });
    const video = mustSelect<HTMLVideoElement>(container, "video");
    expect(video.muted).toBe(true);
    expect(video.hasAttribute("webkit-playsinline")).toBe(true);
    expect(video.getAttribute("poster")).toBe("https://example.com/poster.png");

    Object.defineProperty(video, "duration", { value: 3.5, configurable: true });
    Object.defineProperty(video, "readyState", { value: 4, configurable: true });
    fireEvent.loadedMetadata(video);
    fireEvent(video, new Event("canplay"));

    expect(onDuration).toHaveBeenCalledWith(3.5);
    expect(play).toHaveBeenCalled();
    expect(root.getAttribute("data-state")).toBe("ready");
    expect(states).toContain("ready");

    // Leaving viewport pauses playback without unmounting the video.
    act(() => {
      FakeIntersectionObserver.last().leave(root);
    });
    expect(pause).toHaveBeenCalled();
    expect(container.querySelector("video")).not.toBeNull();
    expect(root.getAttribute("data-state")).toBe("paused");
  });

  test("pauses when tab hides or active becomes false, and restarts on active when configured", () => {
    stubIntersectionObserver();
    stubReducedMotion(false);
    const { play, pause } = stubMediaPlayback();

    const { container, rerender } = render(
      <Gif src="https://example.com/clip.mp4" active restartOnActive />,
    );
    const root = mustSelect<HTMLElement>(container, '[data-part="gif"]');
    expect(root.getAttribute("aria-hidden")).toBe("true");

    act(() => {
      FakeIntersectionObserver.last().enter(root);
    });
    const video = mustSelect<HTMLVideoElement>(container, "video");
    Object.defineProperty(video, "readyState", { value: 4, configurable: true });
    fireEvent.loadedMetadata(video);
    fireEvent(video, new Event("canplay"));
    play.mockClear();
    pause.mockClear();

    // Tab hidden pauses playback.
    act(() => {
      setTabHidden(true);
    });
    expect(pause).toHaveBeenCalledTimes(1);

    act(() => {
      setTabHidden(false);
    });
    expect(play).toHaveBeenCalled();

    // External active=false pauses; active=true restarts currentTime to 0.
    video.currentTime = 2;
    rerender(<Gif src="https://example.com/clip.mp4" active={false} restartOnActive />);
    expect(pause).toHaveBeenCalledTimes(2);

    rerender(<Gif src="https://example.com/clip.mp4" active restartOnActive />);
    expect(video.currentTime).toBe(0);
    expect(play).toHaveBeenCalled();
  });

  test("respects reduced motion in both pause and fallback modes", () => {
    stubIntersectionObserver();
    stubReducedMotion(true);
    const { play, pause } = stubMediaPlayback();

    const { container, rerender } = render(
      <Gif src="https://example.com/clip.mp4" fallback={<span>Static fallback</span>} />,
    );
    const root = mustSelect<HTMLElement>(container, '[data-part="gif"]');
    act(() => {
      FakeIntersectionObserver.last().enter(root);
    });

    // Default reducedBehavior="pause": video mounts with preload="metadata", never plays.
    const video = mustSelect<HTMLVideoElement>(container, "video");
    expect(video.getAttribute("preload")).toBe("metadata");
    expect(play).not.toHaveBeenCalled();
    expect(pause).toHaveBeenCalled();

    // reducedBehavior="fallback": unmounts video and renders fallback.
    rerender(
      <Gif
        src="https://example.com/clip.mp4"
        reducedBehavior="fallback"
        fallback={<span>Static fallback</span>}
      />,
    );
    expect(container.querySelector("video")).toBeNull();
    expect(screen.getByText("Static fallback")).toBeTruthy();
    expect(root.getAttribute("data-state")).toBe("paused");
  });

  test("swaps to fallback on video or source error and resets when src changes", () => {
    stubIntersectionObserver();
    stubReducedMotion(false);
    stubMediaPlayback();

    const { container, rerender } = render(
      <Gif src="https://example.com/broken.mp4" fallback={<span>Offline graphic</span>} />,
    );
    const root = mustSelect<HTMLElement>(container, '[data-part="gif"]');
    act(() => {
      FakeIntersectionObserver.last().enter(root);
    });
    const source = mustSelect<HTMLSourceElement>(container, "source");
    fireEvent.error(source);

    expect(container.querySelector("video")).toBeNull();
    expect(screen.getByText("Offline graphic")).toBeTruthy();
    expect(root.getAttribute("data-state")).toBe("error");

    // Changing src retries cleanly.
    rerender(<Gif src="https://example.com/good.mp4" fallback={<span>Offline graphic</span>} />);
    expect(container.querySelector("video")).not.toBeNull();
    expect(screen.queryByText("Offline graphic")).toBeNull();
  });

  test("renders fallback when src is omitted, or null when both src and fallback are absent", () => {
    stubIntersectionObserver();
    stubReducedMotion(false);

    const { container, rerender } = render(<Gif />);
    expect(container.firstChild).toBeNull();

    rerender(<Gif fallback={<span>Empty slot</span>} />);
    expect(screen.getByText("Empty slot")).toBeTruthy();
    expect(container.querySelector('[data-part="gif"]')?.getAttribute("data-state")).toBe("error");
  });

  test("automatically switches to an <img> player for .webp assets, swaps to poster/fallback when paused or broken, and detects .webm", () => {
    stubIntersectionObserver();
    const setReduced = stubReducedMotion(false);
    stubMediaPlayback();

    const { container, rerender } = render(
      <Gif
        src="https://i.giphy.com/HteV6g0QTNxp6/giphy.webp?cid=123"
        poster="https://example.com/static-frame.png"
        fallback={<span>WebP fallback</span>}
        label="Animated WebP"
      />,
    );
    const root = screen.getByRole("img", { name: "Animated WebP" });
    act(() => {
      FakeIntersectionObserver.last().enter(root);
    });

    const img = mustSelect<HTMLImageElement>(container, 'img[data-part="gif-image"]');
    expect(container.querySelector("video")).toBeNull();
    expect(img.getAttribute("src")).toBe("https://i.giphy.com/HteV6g0QTNxp6/giphy.webp?cid=123");
    fireEvent.load(img);
    expect(root.getAttribute("data-state")).toBe("ready");

    // When paused (active=false), swaps animated .webp to static poster.
    rerender(
      <Gif
        src="https://i.giphy.com/HteV6g0QTNxp6/giphy.webp?cid=123"
        poster="https://example.com/static-frame.png"
        fallback={<span>WebP fallback</span>}
        label="Animated WebP"
        active={false}
      />,
    );
    expect(
      mustSelect<HTMLImageElement>(container, 'img[data-part="gif-image"]').getAttribute("src"),
    ).toBe("https://example.com/static-frame.png");
    expect(root.getAttribute("data-state")).toBe("paused");

    // Reduced motion without a poster falls back cleanly so animated WebP never loops.
    act(() => {
      setReduced(true);
    });
    rerender(
      <Gif
        src="https://i.giphy.com/HteV6g0QTNxp6/giphy.webp"
        fallback={<span>WebP fallback</span>}
        label="Animated WebP"
      />,
    );
    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByText("WebP fallback")).toBeTruthy();

    // Error on .webp swaps to fallback; .webm uses video/webm source type.
    act(() => {
      setReduced(false);
    });
    rerender(
      <Gif
        src="https://example.com/broken.webp"
        fallback={<span>WebP fallback</span>}
        label="Animated WebP"
      />,
    );
    fireEvent.error(mustSelect<HTMLImageElement>(container, 'img[data-part="gif-image"]'));
    expect(screen.getByText("WebP fallback")).toBeTruthy();
    expect(root.getAttribute("data-state")).toBe("error");

    rerender(<Gif src="https://example.com/clip.webm#t=1" label="Animated WebP" />);
    expect(mustSelect<HTMLSourceElement>(container, "source").getAttribute("type")).toBe(
      "video/webm",
    );
  });
});
