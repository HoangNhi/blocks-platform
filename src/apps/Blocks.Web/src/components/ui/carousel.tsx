import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type CarouselContextValue = {
  viewportRef: React.RefObject<HTMLDivElement | null>;
  currentIndex: number;
  count: number;
  scrollPrev: () => void;
  scrollNext: () => void;
  goTo: (index: number) => void;
  setCurrentIndex: React.Dispatch<React.SetStateAction<number>>;
  setCount: React.Dispatch<React.SetStateAction<number>>;
};

const CarouselContext = React.createContext<CarouselContextValue | null>(null);

function useCarousel() {
  const context = React.useContext(CarouselContext);

  if (!context) {
    throw new Error("Carousel components must be used within <Carousel />");
  }

  return context;
}

function Carousel({
  className,
  children,
  opts,
  ...props
}: React.ComponentProps<"div"> & {
  opts?: {
    align?: "start" | "center";
  };
}) {
  const viewportRef = React.useRef<HTMLDivElement | null>(null);
  const [currentIndex, setCurrentIndex] = React.useState(0);
  const [count, setCount] = React.useState(0);

  const goTo = React.useCallback(
    (index: number) => {
      const viewport = viewportRef.current;
      if (!viewport) {
        return;
      }

      const width = viewport.clientWidth || 1;
      const target = Math.max(0, Math.min(index, Math.max(count - 1, 0)));
      viewport.scrollTo({ left: target * width, behavior: "smooth" });
      setCurrentIndex(target);
    },
    [count],
  );

  const value = React.useMemo<CarouselContextValue>(
    () => ({
      viewportRef,
      currentIndex,
      count,
      scrollPrev: () => goTo(currentIndex - 1),
      scrollNext: () => goTo(currentIndex + 1),
      goTo,
      setCurrentIndex,
      setCount,
    }),
    [count, currentIndex, goTo],
  );

  return (
    <CarouselContext.Provider value={value}>
      <div
        className={cn("relative", className)}
        data-align={opts?.align ?? "start"}
        {...props}
      >
        {children}
      </div>
    </CarouselContext.Provider>
  );
}

function CarouselContent({
  className,
  children,
}: React.ComponentProps<"div">) {
  const { viewportRef, setCount, setCurrentIndex } = useCarousel();
  const items = React.Children.toArray(children);

  React.useEffect(() => {
    setCount(items.length);
  }, [items.length, setCount]);

  return (
    <div
      ref={viewportRef}
      className={cn(
        "flex w-full overflow-x-auto scroll-smooth rounded-2xl snap-x snap-mandatory [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden",
        className,
      )}
      onScroll={() => {
        const viewport = viewportRef.current;
        if (!viewport) {
          return;
        }
        const width = viewport.clientWidth || 1;
        const index = Math.round(viewport.scrollLeft / width);
        setCurrentIndex(index);
        setCount(items.length);
        viewport.dataset.index = String(index);
      }}
    >
      {items}
    </div>
  );
}

function CarouselItem({
  className,
  children,
}: React.ComponentProps<"div">) {
  return (
    <div className={cn("min-w-0 shrink-0 basis-full snap-start px-1", className)}>
      {children}
    </div>
  );
}

function CarouselPrevious({
  className,
  ...props
}: React.ComponentProps<typeof Button>) {
  const { currentIndex, scrollPrev } = useCarousel();

  return (
    <Button
      type="button"
      variant="outline"
      size="icon"
      className={cn(
        "absolute left-3 top-1/2 z-10 h-9 w-9 -translate-y-1/2 rounded-full bg-white/90 shadow-sm backdrop-blur",
        className,
      )}
      disabled={currentIndex <= 0}
      onClick={scrollPrev}
      {...props}
    >
      <ChevronLeft className="h-4 w-4" />
      <span className="sr-only">Trang trước</span>
    </Button>
  );
}

function CarouselNext({
  className,
  ...props
}: React.ComponentProps<typeof Button>) {
  const { currentIndex, count, scrollNext } = useCarousel();

  return (
    <Button
      type="button"
      variant="outline"
      size="icon"
      className={cn(
        "absolute right-3 top-1/2 z-10 h-9 w-9 -translate-y-1/2 rounded-full bg-white/90 shadow-sm backdrop-blur",
        className,
      )}
      disabled={currentIndex >= count - 1}
      onClick={scrollNext}
      {...props}
    >
      <ChevronRight className="h-4 w-4" />
      <span className="sr-only">Trang sau</span>
    </Button>
  );
}

function CarouselDots({
  className,
}: React.ComponentProps<"div">) {
  const { count, currentIndex, goTo } = useCarousel();

  if (count <= 1) {
    return null;
  }

  return (
    <div className={cn("flex items-center justify-center gap-2", className)}>
      {Array.from({ length: count }).map((_, index) => (
        <button
          key={index}
          type="button"
          aria-label={`Đi tới slide ${index + 1}`}
          onClick={() => goTo(index)}
          className={cn(
            "h-2.5 rounded-full transition-all duration-200",
            index === currentIndex ? "w-8 bg-indigo-500" : "w-2.5 bg-slate-300",
          )}
        />
      ))}
    </div>
  );
}

function CarouselNavigation({
  className,
}: React.ComponentProps<"div">) {
  const { currentIndex, count, scrollPrev, scrollNext, goTo } = useCarousel();

  if (count <= 1) {
    return null;
  }

  return (
    <div className={cn("mt-4 flex items-center justify-center gap-3", className)}>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-8 w-8 rounded-full text-slate-400 hover:text-slate-700 disabled:opacity-30"
        disabled={currentIndex <= 0}
        onClick={scrollPrev}
      >
        <ChevronLeft className="h-4 w-4" />
        <span className="sr-only">Trang trước</span>
      </Button>

      {Array.from({ length: count }).map((_, index) => (
        <button
          key={index}
          type="button"
          aria-label={`Đi tới slide ${index + 1}`}
          onClick={() => goTo(index)}
          className={cn(
            "h-2 rounded-full transition-all duration-200",
            index === currentIndex ? "w-6 bg-indigo-500" : "w-2 bg-slate-300",
          )}
        />
      ))}

      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-8 w-8 rounded-full text-slate-400 hover:text-slate-700 disabled:opacity-30"
        disabled={currentIndex >= count - 1}
        onClick={scrollNext}
      >
        <ChevronRight className="h-4 w-4" />
        <span className="sr-only">Trang sau</span>
      </Button>
    </div>
  );
}

export {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselPrevious,
  CarouselNext,
  CarouselDots,
  CarouselNavigation,
};
