import {
  HorizAlign,
  VertAlign,
  webcamShapeOptions,
  WebcamShape,
} from "../stores";

type Option<T> = {
  title: string;
  value: T;
  ariaLabel: string;
};

type SizeOption = Option<number>;

export const webcamShapeOptionsWithLabels: Option<(typeof webcamShapeOptions)[number]>[] = [
  { title: "●", value: webcamShapeOptions[0], ariaLabel: "Circle" },
  { title: "■", value: webcamShapeOptions[1], ariaLabel: "Rectangle" },
];

export const horizScreenAlignOptionsWithLabels: Option<HorizAlign>[] = [
  { title: "◀", value: HorizAlign.left, ariaLabel: "Left" },
  { title: "●", value: HorizAlign.center, ariaLabel: "Center" },
  { title: "▶", value: HorizAlign.right, ariaLabel: "Right" },
];

export const vertScreenAlignOptionsWithLabels: Option<VertAlign>[] = [
  { title: "▲", value: VertAlign.top, ariaLabel: "Top" },
  { title: "●", value: VertAlign.center, ariaLabel: "Center" },
  { title: "▼", value: VertAlign.bottom, ariaLabel: "Bottom" },
];

export const sizeOptions: SizeOption[] = [
  { title: "S", value: 0.2, ariaLabel: "Small" },
  { title: "M", value: 0.28, ariaLabel: "Medium" },
  { title: "L", value: 0.36, ariaLabel: "Large" },
  { title: "XL", value: 0.44, ariaLabel: "Extra large" },
];

export const isCircularShape = (shape: WebcamShape) => shape === WebcamShape.circle;
