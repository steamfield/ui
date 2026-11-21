import {
  type CSSProperties,
  type ReactElement,
  type ReactNode,
  type RefObject,
  type SyntheticEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import type { MotionPreference, MotionSource } from "../../playback/index.ts";
import { useGate } from "../playback/use-playback.ts";

/** Lifecycle state of a `<Gif />` media element. */
export type GifLoadState = "idle" | "loading" | "ready" | "error";

/** How `<Gif />` behaves when motion is reduced (`prefers-reduced-motion` or custom `motion`). */
export type GifReducedBehavior = "pause" | "fallback";

export interface GifProps {
  /**
   * Media URL (`.mp4`/`.webm` played via `<video>`, or `.webp`/`.gif`/image rendered via `<img>`
   * automatically). When omitted, renders `fallback` if provided, else `null`.
   */
  readonly src?: string;
  /** Optional static poster image shown before load or when paused. */
  readonly poster?: string;
  /**
   * Rendered when `src` fails to load (offline, network/CSP failure), when `src` is absent, or
   * when `reducedBehavior="fallback"` and motion is reduced (or for animated images without a
   * `poster` while reduced motion is active).
   */
  readonly fallback?: ReactNode;
  /** Behavior when reduced motion is active. Default `"pause"`. */
  readonly reducedBehavior?: GifReducedBehavior;
  /** Motion preference or custom `MotionSource` forwarded to `usePlayback`. Default `"auto"`. */
  readonly motion?: MotionPreference | MotionSource;
  /** IntersectionObserver rootMargin for lazy loading. Default `"200px"`. */
  readonly rootMargin?: string;
  /**
   * External active gate (e.g. parent lazy-section or native window visibility). When `false`,
   * playback pauses immediately. Default `true`.
   */
  readonly active?: boolean;
  /** Restart video playback from `0` when `active` flips from `false` to `true`. Default `false`. */
  readonly restartOnActive?: boolean;
  /** Accessible description. When omitted, marks the container decorative (`aria-hidden="true"`). */
  readonly label?: string;
  /** Called when video metadata loads with its duration in seconds. */
  readonly onDurationChange?: (duration: number) => void;
  /** Called whenever the media lifecycle state changes. */
  readonly onLoadStateChange?: (state: GifLoadState) => void;
  readonly className?: string;
  readonly videoClassName?: string;
  readonly style?: CSSProperties;
}

const IMAGE_ASSET_RE = /\.(webp|gif|avif|apng|png|jpe?g)$/i;
const WEBM_ASSET_RE = /\.webm$/i;

function stripUrlQuery(src: string): string {
  const hashIdx = src.indexOf("#");
  const withoutHash = hashIdx >= 0 ? src.slice(0, hashIdx) : src;
  const queryIdx = withoutHash.indexOf("?");
  return queryIdx >= 0 ? withoutHash.slice(0, queryIdx) : withoutHash;
}

function isImageAsset(src: string | undefined): boolean {
  return Boolean(src) && IMAGE_ASSET_RE.test(stripUrlQuery(src ?? ""));
}

function videoMimeType(src: string): string {
  return WEBM_ASSET_RE.test(stripUrlQuery(src)) ? "video/webm" : "video/mp4";
}

function initialLoadState(src: string | undefined, entered: boolean): GifLoadState {
  if (!src) return "error";
  return entered ? "loading" : "idle";
}

function resolveReportedState(
  src: string | undefined,
  loadState: GifLoadState,
  entered: boolean,
  showReducedFallback: boolean,
): GifLoadState {
  if (!src || loadState === "error") return "error";
  if (!entered || showReducedFallback) return "idle";
  return loadState;
}

function resolveDataState(input: {
  readonly failed: boolean;
  readonly showReducedFallback: boolean;
  readonly loadState: GifLoadState;
  readonly shouldPlay: boolean;
  readonly reportedState: GifLoadState;
}): string {
  if (input.failed) return "error";
  if (input.showReducedFallback || (input.loadState === "ready" && !input.shouldPlay)) {
    return "paused";
  }
  return input.reportedState;
}

function useVideoPlaybackSync(
  videoRef: RefObject<HTMLVideoElement | null>,
  shouldMountVideo: boolean,
  shouldPlay: boolean,
): void {
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !shouldMountVideo) return;

    video.muted = true;
    video.setAttribute("webkit-playsinline", "");

    if (!shouldPlay) {
      video.pause();
      return;
    }

    const tryPlay = (): void => {
      video.muted = true;
      const result = video.play();
      if (result && typeof result.catch === "function") {
        void result.catch(() => {});
      }
    };

    if (video.readyState >= 2) {
      tryPlay();
    }

    video.addEventListener("canplay", tryPlay);
    return () => {
      video.removeEventListener("canplay", tryPlay);
    };
  }, [videoRef, shouldMountVideo, shouldPlay]);
}

interface MediaProps {
  readonly src: string;
  readonly imageMode: boolean;
  readonly shouldPlay: boolean;
  readonly reduced: boolean;
  readonly poster: string | undefined;
  readonly videoClassName: string | undefined;
  readonly videoRef: RefObject<HTMLVideoElement | null>;
  readonly onLoadedMetadata: (event: SyntheticEvent<HTMLVideoElement>) => void;
  readonly onImageLoad: () => void;
  readonly onError: () => void;
}

function GifMedia(props: MediaProps): ReactElement {
  if (props.imageMode) {
    const imageSrc = !props.shouldPlay && props.poster ? props.poster : props.src;
    return (
      <img
        key={imageSrc}
        src={imageSrc}
        alt=""
        data-part="gif-image"
        decoding="async"
        className={props.videoClassName}
        onLoad={props.onImageLoad}
        onError={props.onError}
      />
    );
  }
  return (
    <video
      key={props.src}
      ref={props.videoRef}
      data-part="gif-video"
      autoPlay={props.shouldPlay}
      loop
      muted
      playsInline
      poster={props.poster}
      preload={props.reduced ? "metadata" : "auto"}
      className={props.videoClassName}
      onLoadedMetadata={props.onLoadedMetadata}
      onError={props.onError}
    >
      <source src={props.src} type={videoMimeType(props.src)} onError={props.onError} />
    </video>
  );
}

/**
 * Video- and animated-image-as-GIF component backed by `@steamfield/ui/playback`.
 *
 * Automatically chooses `<video>` for `.mp4`/`.webm` assets and `<img>` for `.webp`/`.gif` assets.
 * Plays only while in view, tab-visible, `active`, and motion is allowed; pauses cleanly
 * otherwise, handles iOS/WKWebView inline video quirks, and degrades to `fallback` when offline
 * or when media fails to load.
 */
export function Gif({
  src,
  poster,
  fallback,
  reducedBehavior = "pause",
  motion = "auto",
  rootMargin = "200px",
  active = true,
  restartOnActive = false,
  label,
  onDurationChange,
  onLoadStateChange,
  className,
  videoClassName,
  style,
}: GifProps): ReactElement | null {
  const { ref, state: gate } = useGate<HTMLDivElement>({
    rootMargin,
    threshold: 0,
    motion,
    reducedPolicy: "hold",
  });
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const prevActiveRef = useRef<boolean>(active);
  const [entered, setEntered] = useState<boolean>(false);
  const [loadState, setLoadState] = useState<GifLoadState>(() => initialLoadState(src, false));

  const imageMode = isImageAsset(src);

  useEffect(() => {
    if (gate.inView) setEntered(true);
  }, [gate.inView]);

  useEffect(() => {
    setLoadState(initialLoadState(src, entered));
  }, [src, entered]);

  const showReducedFallback =
    gate.reduced &&
    (reducedBehavior === "fallback" || (imageMode && !poster && fallback !== undefined));
  const failed = !src || loadState === "error";
  const showFallback = failed || showReducedFallback;
  const shouldMountMedia = Boolean(src) && entered && !showFallback;
  const shouldPlay = shouldMountMedia && active && gate.playing;

  const reportedState = resolveReportedState(src, loadState, entered, showReducedFallback);
  const lastReportedRef = useRef<GifLoadState | null>(null);
  useEffect(() => {
    if (lastReportedRef.current !== reportedState) {
      lastReportedRef.current = reportedState;
      onLoadStateChange?.(reportedState);
    }
  }, [reportedState, onLoadStateChange]);

  useEffect(() => {
    const wasActive = prevActiveRef.current;
    prevActiveRef.current = active;
    if (restartOnActive && active && !wasActive && videoRef.current) {
      videoRef.current.currentTime = 0;
    }
  }, [active, restartOnActive]);

  useVideoPlaybackSync(videoRef, shouldMountMedia && !imageMode, shouldPlay);

  const handleLoadedMetadata = useCallback(
    (event: SyntheticEvent<HTMLVideoElement>) => {
      const video = event.currentTarget;
      setLoadState("ready");
      if (Number.isFinite(video.duration)) onDurationChange?.(video.duration);
    },
    [onDurationChange],
  );
  const handleImageLoad = useCallback(() => setLoadState("ready"), []);
  const handleError = useCallback(() => setLoadState("error"), []);

  if (showFallback && fallback === undefined) return null;

  const dataState = resolveDataState({
    failed,
    showReducedFallback,
    loadState,
    shouldPlay,
    reportedState,
  });

  let content: ReactNode = null;
  if (showFallback) {
    content = <div data-part="gif-fallback">{fallback}</div>;
  } else if (shouldMountMedia && src) {
    content = (
      <GifMedia
        src={src}
        imageMode={imageMode}
        shouldPlay={shouldPlay}
        reduced={gate.reduced}
        poster={poster}
        videoClassName={videoClassName}
        videoRef={videoRef}
        onLoadedMetadata={handleLoadedMetadata}
        onImageLoad={handleImageLoad}
        onError={handleError}
      />
    );
  }

  const a11yProps = label
    ? { role: "img" as const, "aria-label": label }
    : { "aria-hidden": true as const };

  return (
    <div
      ref={ref}
      data-part="gif"
      data-state={dataState}
      className={className}
      style={style}
      {...a11yProps}
    >
      {content}
    </div>
  );
}
