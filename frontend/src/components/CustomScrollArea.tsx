'use client';

import { useCallback, useEffect, useRef } from 'react';

type ScrollAreaTag = 'div' | 'nav';
type ScrollOrientation = 'vertical' | 'horizontal';

interface Props {
  as?: ScrollAreaTag;
  orientation?: ScrollOrientation;
  className?: string;
  viewportClassName?: string;
  contentClassName?: string;
  children: React.ReactNode;
}

function joinClasses(...classes: Array<string | undefined>) {
  return classes.filter(Boolean).join(' ');
}

export default function CustomScrollArea({
  as: Component = 'div',
  orientation = 'vertical',
  className,
  viewportClassName,
  contentClassName,
  children,
}: Props) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const thumbRef = useRef<HTMLDivElement>(null);

  const syncThumb = useCallback(() => {
    const viewport = viewportRef.current;
    const track = trackRef.current;
    const thumb = thumbRef.current;
    if (!viewport || !track || !thumb) return;

    const clientSize = orientation === 'vertical' ? viewport.clientHeight : viewport.clientWidth;
    const scrollSize = orientation === 'vertical' ? viewport.scrollHeight : viewport.scrollWidth;
    const scrollPosition = orientation === 'vertical' ? viewport.scrollTop : viewport.scrollLeft;
    const maxScroll = scrollSize - clientSize;

    if (maxScroll <= 1) {
      track.style.display = 'none';
      return;
    }

    track.style.display = 'block';
    const trackSize = Math.max(clientSize - 8, 0);
    const thumbSize = Math.max(24, Math.round((clientSize / scrollSize) * trackSize));
    const maxThumbPosition = Math.max(trackSize - thumbSize, 0);
    const thumbPosition = Math.round((scrollPosition / maxScroll) * maxThumbPosition);

    if (orientation === 'vertical') {
      thumb.style.width = '';
      thumb.style.height = `${thumbSize}px`;
      thumb.style.transform = `translate3d(0, ${thumbPosition}px, 0)`;
    } else {
      thumb.style.width = `${thumbSize}px`;
      thumb.style.height = '';
      thumb.style.transform = `translate3d(${thumbPosition}px, 0, 0)`;
    }
  }, [orientation]);

  useEffect(() => {
    const viewport = viewportRef.current;
    const content = contentRef.current;
    if (!viewport) return;

    syncThumb();
    viewport.addEventListener('scroll', syncThumb, { passive: true });

    const resizeObserver = new ResizeObserver(syncThumb);
    resizeObserver.observe(viewport);
    if (content) resizeObserver.observe(content);

    return () => {
      viewport.removeEventListener('scroll', syncThumb);
      resizeObserver.disconnect();
    };
  }, [syncThumb]);

  const handleTrackPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    const viewport = viewportRef.current;
    const track = trackRef.current;
    const thumb = thumbRef.current;
    if (!viewport || !track || !thumb || event.target !== track) return;

    const trackRect = track.getBoundingClientRect();
    const thumbRect = thumb.getBoundingClientRect();
    const clickPosition = orientation === 'vertical' ? event.clientY - trackRect.top : event.clientX - trackRect.left;
    const thumbSize = orientation === 'vertical' ? thumbRect.height : thumbRect.width;
    const thumbCenter = thumbSize / 2;
    const maxScroll =
      orientation === 'vertical' ? viewport.scrollHeight - viewport.clientHeight : viewport.scrollWidth - viewport.clientWidth;
    const trackSize = orientation === 'vertical' ? trackRect.height : trackRect.width;
    const maxThumbPosition = Math.max(trackSize - thumbSize, 1);

    const nextScroll = ((clickPosition - thumbCenter) / maxThumbPosition) * maxScroll;
    if (orientation === 'vertical') {
      viewport.scrollTop = nextScroll;
    } else {
      viewport.scrollLeft = nextScroll;
    }
  };

  const handleThumbPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    const viewport = viewportRef.current;
    const track = trackRef.current;
    const thumb = thumbRef.current;
    if (!viewport || !track || !thumb) return;

    event.preventDefault();
    event.stopPropagation();

    const startPointerPosition = orientation === 'vertical' ? event.clientY : event.clientX;
    const startScrollPosition = orientation === 'vertical' ? viewport.scrollTop : viewport.scrollLeft;
    const maxScroll =
      orientation === 'vertical' ? viewport.scrollHeight - viewport.clientHeight : viewport.scrollWidth - viewport.clientWidth;
    const trackRect = track.getBoundingClientRect();
    const thumbRect = thumb.getBoundingClientRect();
    const trackSize = orientation === 'vertical' ? trackRect.height : trackRect.width;
    const thumbSize = orientation === 'vertical' ? thumbRect.height : thumbRect.width;
    const maxThumbPosition = Math.max(trackSize - thumbSize, 1);

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const pointerPosition = orientation === 'vertical' ? moveEvent.clientY : moveEvent.clientX;
      const delta = pointerPosition - startPointerPosition;
      const nextScroll = startScrollPosition + (delta / maxThumbPosition) * maxScroll;
      if (orientation === 'vertical') {
        viewport.scrollTop = nextScroll;
      } else {
        viewport.scrollLeft = nextScroll;
      }
    };

    const handlePointerUp = () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp, { once: true });
  };

  return (
    <Component className={joinClasses('relative overflow-hidden', className)}>
      <div
        ref={viewportRef}
        className={joinClasses(
          'custom-scroll-viewport w-full',
          orientation === 'vertical' ? 'h-full overflow-y-auto overflow-x-hidden' : 'overflow-x-auto overflow-y-hidden',
          viewportClassName
        )}
      >
        <div
          ref={contentRef}
          className={joinClasses(orientation === 'vertical' ? 'min-h-full' : 'w-max min-w-full', contentClassName)}
        >
          {children}
        </div>
      </div>
      <div
        ref={trackRef}
        aria-hidden="true"
        className={joinClasses(
          'absolute hidden',
          orientation === 'vertical' ? 'right-1 top-1 bottom-1 w-1' : 'left-1 right-1 bottom-1 h-1'
        )}
        onPointerDown={handleTrackPointerDown}
      >
        <div
          ref={thumbRef}
          className={joinClasses(
            'absolute rounded-full bg-zinc-400/75 transition-colors hover:bg-zinc-500',
            orientation === 'vertical' ? 'right-0 top-0 w-1' : 'left-0 bottom-0 h-1'
          )}
          onPointerDown={handleThumbPointerDown}
        />
      </div>
    </Component>
  );
}
