import { EventEmitter, Inject, Injectable, InjectionToken, NgZone, Optional } from '@angular/core';
import bbox from '@turf/bbox';
import { polygon } from '@turf/helpers';
// import * as MapboxGl from 'mapbox-gl';
import { AsyncSubject, Observable, Subscription } from 'rxjs';
import { first } from 'rxjs/operators';
import { BBox } from 'supercluster';
import { MapEvent, MapImageData, MapImageOptions } from './map.types';
import {
  Anchor,
  AnimationOptions, BackgroundLayout,
  BackgroundPaint,
  CameraOptions,
  CanvasSourceOptions, CircleLayout,
  CirclePaint,
  Control, EventData, FillExtrusionLayout,
  FillExtrusionPaint, FillLayout,
  FillPaint,
  FlyToOptions,
  GeoJSONSource,
  GeoJSONSourceRaw,
  IControl,
  ImageSourceOptions,
  Layer, LineLayout,
  LinePaint,
  LngLatBoundsLike,
  LngLatLike,
  Map as MbMap,
  MapboxOptions, MapBoxZoomEvent,
  MapMouseEvent, MapTouchEvent,
  Marker,
  MarkerOptions,
  PointLike,
  Popup,
  PopupOptions, RasterLayout,
  RasterPaint,
  RasterSource,
  Style, SymbolLayout,
  SymbolPaint,
  VectorSource,
  VideoSourceOptions
} from 'mapbox-gl';

export const MAPBOX_API_KEY = new InjectionToken('MapboxApiKey');

export abstract class MglResizeEventEmitter {
  abstract resizeEvent: Observable<void>;
}

export interface SetupMap {
  accessToken?: string;
  customMapboxApiUrl?: string;
  mapOptions: any; // MapboxOptions
  mapEvents: MapEvent;
}

export interface SetupLayer {
  layerOptions: Layer;
  layerEvents: {
    click: EventEmitter<MapMouseEvent>;
    mouseEnter: EventEmitter<MapMouseEvent>;
    mouseLeave: EventEmitter<MapMouseEvent>;
    mouseMove: EventEmitter<MapMouseEvent>;
  };
}

export interface SetupPopup {
  popupOptions: PopupOptions;
  popupEvents: {
    open: EventEmitter<void>;
    close: EventEmitter<void>;
  };
}

export interface SetupMarker {
  markersOptions: {
    offset?: PointLike;
    anchor?: Anchor;
    draggable?: boolean;
    element: HTMLElement;
    feature?: GeoJSON.Feature<GeoJSON.Point>;
    lngLat?: LngLatLike;
  };
  markersEvents: {
    dragStart: EventEmitter<Marker>;
    drag: EventEmitter<Marker>;
    dragEnd: EventEmitter<Marker>;
  };
}

export type AllSource = VectorSource |
  RasterSource |
  GeoJSONSource |
  ImageSourceOptions |
  VideoSourceOptions |
  GeoJSONSourceRaw |
  CanvasSourceOptions;

export type MovingOptions = FlyToOptions |
  (AnimationOptions & CameraOptions) |
  CameraOptions;

@Injectable()
export class MapService {
  mapInstance: MbMap;
  mapCreated$: Observable<void>;
  mapLoaded$: Observable<void>;
  mapEvents: MapEvent;

  private mapCreated = new AsyncSubject<void>();
  private mapLoaded = new AsyncSubject<void>();
  private layerIdsToRemove: string[] = [];
  private sourceIdsToRemove: string[] = [];
  private markersToRemove: Marker[] = [];
  private popupsToRemove: Popup[] = [];
  private imageIdsToRemove: string[] = [];
  private subscription = new Subscription();

  constructor(
    private zone: NgZone,
    @Optional() @Inject(MAPBOX_API_KEY) private readonly MAPBOX_API_KEY: string,
    @Optional() private readonly MglResizeEventEmitter: MglResizeEventEmitter
  ) {
    this.mapCreated$ = this.mapCreated.asObservable();
    this.mapLoaded$ = this.mapLoaded.asObservable();
  }

  setup(options: SetupMap) {
    // Need onStable to wait for a potential @angular/route transition to end
    this.zone.onStable.pipe(first()).subscribe(() => {
      // Workaround rollup issue
      console.log(this.MAPBOX_API_KEY);
      // this.assign(MapboxGl, 'accessToken', options.accessToken || this.MAPBOX_API_KEY);
      if (options.customMapboxApiUrl) {
        // this.assign(MapboxGl, 'config.API_URL', options.customMapboxApiUrl);
      }
      this.createMap(options.mapOptions);
      this.hookEvents(options.mapEvents);
      this.mapEvents = options.mapEvents;
      this.mapCreated.next(undefined);
      this.mapCreated.complete();
    });
  }

  destroyMap() {
    this.subscription.unsubscribe();
    this.mapInstance.remove();
  }

  updateMinZoom(minZoom: number) {
    return this.zone.runOutsideAngular(() => {
      this.mapInstance.setMinZoom(minZoom);
    });
  }

  updateMaxZoom(maxZoom: number) {
    return this.zone.runOutsideAngular(() => {
      this.mapInstance.setMaxZoom(maxZoom);
    });
  }

  updateScrollZoom(status: boolean) {
    return this.zone.runOutsideAngular(() => {
      status ? this.mapInstance.scrollZoom.enable() : this.mapInstance.scrollZoom.disable();
    });
  }

  updateDragRotate(status: boolean) {
    return this.zone.runOutsideAngular(() => {
      status ? this.mapInstance.dragRotate.enable() : this.mapInstance.dragRotate.disable();
    });
  }

  updateTouchZoomRotate(status: boolean) {
    return this.zone.runOutsideAngular(() => {
      status ? this.mapInstance.touchZoomRotate.enable() : this.mapInstance.touchZoomRotate.disable();
    });
  }

  updateDoubleClickZoom(status: boolean) {
    return this.zone.runOutsideAngular(() => {
      status ? this.mapInstance.doubleClickZoom.enable() : this.mapInstance.doubleClickZoom.disable();
    });
  }

  updateKeyboard(status: boolean) {
    return this.zone.runOutsideAngular(() => {
      status ? this.mapInstance.keyboard.enable() : this.mapInstance.keyboard.disable();
    });
  }

  updateDragPan(status: boolean) {
    return this.zone.runOutsideAngular(() => {
      status ? this.mapInstance.dragPan.enable() : this.mapInstance.dragPan.disable();
    });
  }

  updateBoxZoom(status: boolean) {
    return this.zone.runOutsideAngular(() => {
      status ? this.mapInstance.boxZoom.enable() : this.mapInstance.boxZoom.disable();
    });
  }

  updateStyle(style: Style) {
    // TODO Probably not so simple, write demo/tests
    return this.zone.runOutsideAngular(() => {
      this.mapInstance.setStyle(style);
    });
  }

  updateMaxBounds(maxBounds: LngLatBoundsLike) {
    // TODO Probably not so simple, write demo/tests
    return this.zone.runOutsideAngular(() => {
      this.mapInstance.setMaxBounds(maxBounds);
    });
  }

  changeCanvasCursor(cursor: string) {
    const canvas = this.mapInstance.getCanvasContainer();
    canvas.style.cursor = cursor;
  }

  queryRenderedFeatures(
    pointOrBox?: PointLike | PointLike[],
    parameters?: { layers?: string[], filter?: any[] }
  ): GeoJSON.Feature<GeoJSON.GeometryObject>[] {
    return this.mapInstance.queryRenderedFeatures(pointOrBox, parameters);
  }

  panTo(center: LngLatLike, options?: AnimationOptions) {
    return this.zone.runOutsideAngular(() => {
      this.mapInstance.panTo(center, options);
    });
  }

  move(
    movingMethod: 'jumpTo' | 'easeTo' | 'flyTo',
    movingOptions?: MovingOptions,
    zoom?: number,
    center?: LngLatLike,
    bearing?: number,
    pitch?: number
  ) {
    return this.zone.runOutsideAngular(() => {
      (<any>this.mapInstance[movingMethod])({
        ...movingOptions,
        zoom: zoom ? zoom : this.mapInstance.getZoom(),
        center: center ? center : this.mapInstance.getCenter(),
        bearing: bearing ? bearing : this.mapInstance.getBearing(),
        pitch: pitch ? pitch : this.mapInstance.getPitch()
      });
    });
  }

  addLayer(layer: SetupLayer, bindEvents: boolean, before?: string) {
    this.zone.runOutsideAngular(() => {
      Object.keys(layer.layerOptions)
        .forEach((key: string) => {
          const tkey = <keyof Layer>key;
          if (layer.layerOptions[tkey] === undefined) {
            delete layer.layerOptions[tkey];
          }
        });
      this.mapInstance.addLayer(layer.layerOptions, before);
      if (bindEvents) {
        if (layer.layerEvents.click.observers.length) {
          this.mapInstance.on('click', layer.layerOptions.id, (evt: MapMouseEvent) => {
            this.zone.run(() => {
              layer.layerEvents.click.emit(evt);
            });
          });
        }
        if (layer.layerEvents.mouseEnter.observers.length) {
          this.mapInstance.on('mouseenter', layer.layerOptions.id, (evt: MapMouseEvent) => {
            this.zone.run(() => {
              layer.layerEvents.mouseEnter.emit(evt);
            });
          });
        }
        if (layer.layerEvents.mouseLeave.observers.length) {
          this.mapInstance.on('mouseleave', layer.layerOptions.id, (evt: MapMouseEvent) => {
            this.zone.run(() => {
              layer.layerEvents.mouseLeave.emit(evt);
            });
          });
        }
        if (layer.layerEvents.mouseMove.observers.length) {
          this.mapInstance.on('mousemove', layer.layerOptions.id, (evt: MapMouseEvent) => {
            this.zone.run(() => {
              layer.layerEvents.mouseMove.emit(evt);
            });
          });
        }
      }
    });
  }

  removeLayer(layerId: string) {
    this.layerIdsToRemove.push(layerId);
  }

  addMarker(marker: SetupMarker) {
    const options: MarkerOptions = {
      offset: marker.markersOptions.offset,
      anchor: marker.markersOptions.anchor,
      draggable: !!marker.markersOptions.draggable
    };
    if (marker.markersOptions.element.childNodes.length > 0) {
      options.element = marker.markersOptions.element;
    }
    const markerInstance = new Marker(options);
    if (marker.markersEvents.dragStart.observers.length) {
      markerInstance.on('dragstart', (event: { target: Marker }) =>
        this.zone.run(() => marker.markersEvents.dragStart.emit(event.target))
      );
    }
    if (marker.markersEvents.drag.observers.length) {
      markerInstance.on('drag', (event: { target: Marker }) =>
        this.zone.run(() => marker.markersEvents.drag.emit(event.target))
      );
    }
    if (marker.markersEvents.dragEnd.observers.length) {
      markerInstance.on('dragend', (event: { target: Marker }) =>
        this.zone.run(() => marker.markersEvents.dragEnd.emit(event.target))
      );
    }
    markerInstance.setLngLat(marker.markersOptions.feature ?
      marker.markersOptions.feature.geometry!.coordinates :
      marker.markersOptions.lngLat!
    );
    return this.zone.runOutsideAngular(() => {
      markerInstance.addTo(this.mapInstance);
      return markerInstance;
    });
  }

  removeMarker(marker: Marker) {
    this.markersToRemove.push(marker);
  }

  createPopup(popup: SetupPopup, element: Node) {
    return this.zone.runOutsideAngular(() => {
      Object.keys(popup.popupOptions)
        .forEach((key) =>
          (<any>popup.popupOptions)[key] === undefined && delete (<any>popup.popupOptions)[key]);
      const popupInstance = new Popup(popup.popupOptions);
      popupInstance.setDOMContent(element);
      if (popup.popupEvents.close.observers.length) {
        popupInstance.on('close', () => {
          this.zone.run(() => {
            popup.popupEvents.close.emit();
          });
        });
      }
      if (popup.popupEvents.open.observers.length) {
        popupInstance.on('open', () => {
          this.zone.run(() => {
            popup.popupEvents.open.emit();
          });
        });
      }
      return popupInstance;
    });
  }

  addPopupToMap(popup: Popup, lngLat: LngLatLike, skipOpenEvent = false) {
    return this.zone.runOutsideAngular(() => {
      if (skipOpenEvent && (<any>popup)._listeners) {
        delete (<any>popup)._listeners['open'];
      }
      popup.setLngLat(lngLat);
      popup.addTo(this.mapInstance);
    });
  }

  addPopupToMarker(marker: Marker, popup: Popup) {
    return this.zone.runOutsideAngular(() => {
      marker.setPopup(popup);
    });
  }

  removePopupFromMap(popup: Popup, skipCloseEvent = false) {
    if (skipCloseEvent && (<any>popup)._listeners) {
      delete (<any>popup)._listeners['close'];
    }
    this.popupsToRemove.push(popup);
  }

  removePopupFromMarker(marker: Marker) {
    return this.zone.runOutsideAngular(() => {
      marker.setPopup(undefined);
    });
  }

  addControl(control: Control | IControl, position?: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left') {
    return this.zone.runOutsideAngular(() => {
      this.mapInstance.addControl(<any>control, position);
    });
  }

  removeControl(control: Control | IControl) {
    return this.zone.runOutsideAngular(() => {
      this.mapInstance.removeControl(<any>control);
    });
  }

  async loadAndAddImage(imageId: string, url: string, options?: MapImageOptions) {
    return this.zone.runOutsideAngular(() => {
      return new Promise((resolve, reject) => {
        this.mapInstance.loadImage(url, (error: { status: number } | null, image: ImageData) => {
          if (error) {
            reject(error);
            return;
          }
          this.addImage(imageId, image, options);
          resolve();
        });
      });
    });
  }

  addImage(imageId: string, data: MapImageData, options?: MapImageOptions) {
    return this.zone.runOutsideAngular(() => {
      this.mapInstance.addImage(imageId, <any>data, options);
    });
  }

  removeImage(imageId: string) {
    this.imageIdsToRemove.push(imageId);
  }

  addSource(sourceId: string, source: AllSource) {
    return this.zone.runOutsideAngular(() => {
      Object.keys(source)
        .forEach((key) =>
          (<any>source)[key] === undefined && delete (<any>source)[key]);
      this.mapInstance.addSource(sourceId, <any>source); // Typings issue
    });
  }

  getSource<T>(sourceId: string) {
    return <T><any>this.mapInstance.getSource(sourceId);
  }

  removeSource(sourceId: string) {
    this.sourceIdsToRemove.push(sourceId);
  }

  setAllLayerPaintProperty(
    layerId: string,
    paint: BackgroundPaint |
      FillPaint |
      FillExtrusionPaint |
      LinePaint |
      SymbolPaint |
      RasterPaint |
      CirclePaint
  ) {
    return this.zone.runOutsideAngular(() => {
      Object.keys(paint).forEach((key) => {
        // TODO Check for perf, setPaintProperty only on changed paint props maybe
        this.mapInstance.setPaintProperty(layerId, key, (<any>paint)[key]);
      });
    });
  }

  setAllLayerLayoutProperty(
    layerId: string,
    layout: BackgroundLayout |
      FillLayout |
      FillExtrusionLayout |
      LineLayout |
      SymbolLayout |
      RasterLayout |
      CircleLayout
  ) {
    return this.zone.runOutsideAngular(() => {
      Object.keys(layout).forEach((key) => {
        // TODO Check for perf, setPaintProperty only on changed paint props maybe
        this.mapInstance.setLayoutProperty(layerId, key, (<any>layout)[key]);
      });
    });
  }

  setLayerFilter(layerId: string, filter: any[]) {
    return this.zone.runOutsideAngular(() => {
      this.mapInstance.setFilter(layerId, filter);
    });
  }

  setLayerBefore(layerId: string, beforeId: string) {
    return this.zone.runOutsideAngular(() => {
      this.mapInstance.moveLayer(layerId, beforeId);
    });
  }

  setLayerZoomRange(layerId: string, minZoom?: number, maxZoom?: number) {
    return this.zone.runOutsideAngular(() => {
      this.mapInstance.setLayerZoomRange(layerId, minZoom ? minZoom : 0, maxZoom ? maxZoom : 20);
    });
  }

  fitBounds(bounds: LngLatBoundsLike, options?: any) {
    return this.zone.runOutsideAngular(() => {
      this.mapInstance.fitBounds(bounds, options);
    });
  }

  getCurrentViewportBbox(): BBox {
    const canvas = this.mapInstance.getCanvas();
    const w = canvas.width;
    const h = canvas.height;
    const upLeft = this.mapInstance.unproject([0, 0]).toArray();
    const upRight = this.mapInstance.unproject([w, 0]).toArray();
    const downRight = this.mapInstance.unproject([w, h]).toArray();
    const downLeft = this.mapInstance.unproject([0, h]).toArray();
    return <any>bbox(polygon([[upLeft, upRight, downRight, downLeft, upLeft]]));
  }

  applyChanges() {
    this.zone.runOutsideAngular(() => {
      this.removeLayers();
      this.removeSources();
      this.removeMarkers();
      this.removePopups();
      this.removeImages();
    });
  }

  private createMap(options: MapboxOptions) {
    NgZone.assertNotInAngularZone();
    Object.keys(options)
      .forEach((key: string) => {
        const tkey = <keyof MapboxOptions>key;
        if (options[tkey] === undefined) {
          delete options[tkey];
        }
      });
    this.mapInstance = new MbMap(options);
    const subChanges = this.zone.onMicrotaskEmpty
      .subscribe(() => this.applyChanges());
    if (this.MglResizeEventEmitter) {
      const subResize = this.MglResizeEventEmitter.resizeEvent.subscribe(() => {
        this.mapInstance.resize();
      });
      this.subscription.add(subResize);
    }
    this.subscription.add(subChanges);
  }

  private removeLayers() {
    for (const layerId of this.layerIdsToRemove) {
      this.mapInstance.off('click', layerId);
      this.mapInstance.off('mouseenter', layerId);
      this.mapInstance.off('mouseleave', layerId);
      this.mapInstance.off('mousemove', layerId);
      this.mapInstance.removeLayer(layerId);
    }
    this.layerIdsToRemove = [];
  }

  private removeSources() {
    for (const sourceId of this.sourceIdsToRemove) {
      this.mapInstance.removeSource(sourceId);
    }
    this.sourceIdsToRemove = [];
  }

  private removeMarkers() {
    for (const marker of this.markersToRemove) {
      marker.remove();
    }
    this.markersToRemove = [];
  }

  private removePopups() {
    for (const popup of this.popupsToRemove) {
      popup.remove();
    }
    this.popupsToRemove = [];
  }

  private removeImages() {
    for (const imageId of this.imageIdsToRemove) {
      this.mapInstance.removeImage(imageId);
    }
    this.imageIdsToRemove = [];
  }

  private hookEvents(events: MapEvent) {
    this.mapInstance.on('load', () => {
      this.mapLoaded.next(undefined);
      this.mapLoaded.complete();
      this.zone.run(() => events.load.emit(this.mapInstance));
    });
    if (events.resize.observers.length) {
      this.mapInstance.on('resize', () => this.zone.run(() => events.resize.emit()));
    }
    if (events.remove.observers.length) {
      this.mapInstance.on('remove', () => this.zone.run(() => events.remove.emit()));
    }
    if (events.mouseDown.observers.length) {
      this.mapInstance.on('mousedown', (evt: MapMouseEvent) => this.zone.run(() => events.mouseDown.emit(evt)));
    }
    if (events.mouseUp.observers.length) {
      this.mapInstance.on('mouseup', (evt: MapMouseEvent) => this.zone.run(() => events.mouseUp.emit(evt)));
    }
    if (events.mouseMove.observers.length) {
      this.mapInstance.on('mousemove', (evt: MapMouseEvent) => this.zone.run(() => events.mouseMove.emit(evt)));
    }
    if (events.click.observers.length) {
      this.mapInstance.on('click', (evt: MapMouseEvent) => this.zone.run(() => events.click.emit(evt)));
    }
    if (events.dblClick.observers.length) {
      this.mapInstance.on('dblclick', (evt: MapMouseEvent) => this.zone.run(() => events.dblClick.emit(evt)));
    }
    if (events.mouseEnter.observers.length) {
      this.mapInstance.on('mouseenter', (evt: MapMouseEvent) => this.zone.run(() => events.mouseEnter.emit(evt)));
    }
    if (events.mouseLeave.observers.length) {
      this.mapInstance.on('mouseleave', (evt: MapMouseEvent) => this.zone.run(() => events.mouseLeave.emit(evt)));
    }
    if (events.mouseOver.observers.length) {
      this.mapInstance.on('mouseover', (evt: MapMouseEvent) => this.zone.run(() => events.mouseOver.emit(evt)));
    }
    if (events.mouseOut.observers.length) {
      this.mapInstance.on('mouseout', (evt: MapMouseEvent) => this.zone.run(() => events.mouseOut.emit(evt)));
    }
    if (events.contextMenu.observers.length) {
      this.mapInstance.on('contextmenu', (evt: MapMouseEvent) => this.zone.run(() => events.contextMenu.emit(evt)));
    }
    if (events.touchStart.observers.length) {
      this.mapInstance.on('touchstart', (evt: MapTouchEvent) => this.zone.run(() => events.touchStart.emit(evt)));
    }
    if (events.touchEnd.observers.length) {
      this.mapInstance.on('touchend', (evt: MapTouchEvent) => this.zone.run(() => events.touchEnd.emit(evt)));
    }
    if (events.touchMove.observers.length) {
      this.mapInstance.on('touchmove', (evt: MapTouchEvent) => this.zone.run(() => events.touchMove.emit(evt)));
    }
    if (events.touchCancel.observers.length) {
      this.mapInstance.on('touchcancel', (evt: MapTouchEvent) => this.zone.run(() => events.touchCancel.emit(evt)));
    }
    if (events.wheel.observers.length) {
      // MapWheelEvent
      this.mapInstance.on('wheel', (evt: any) => this.zone.run(() => events.wheel.emit(evt)));
    }
    if (events.moveStart.observers.length) {
      this.mapInstance.on('movestart', (evt: DragEvent) => this.zone.run(() => events.moveStart.emit(evt)));
    }
    if (events.move.observers.length) {
      this.mapInstance.on('move', (evt: MapTouchEvent | MapMouseEvent) => this.zone.run(() => events.move.emit(evt)));
    }
    if (events.moveEnd.observers.length) {
      this.mapInstance.on('moveend', (evt: DragEvent) => this.zone.run(() => events.moveEnd.emit(evt)));
    }
    if (events.dragStart.observers.length) {
      this.mapInstance.on('dragstart', (evt: DragEvent) => this.zone.run(() => events.dragStart.emit(evt)));
    }
    if (events.drag.observers.length) {
      this.mapInstance.on('drag', (evt: MapTouchEvent | MapMouseEvent) => this.zone.run(() => events.drag.emit(evt)));
    }
    if (events.dragEnd.observers.length) {
      this.mapInstance.on('dragend', (evt: DragEvent) => this.zone.run(() => events.dragEnd.emit(evt)));
    }
    if (events.zoomStart.observers.length) {
      this.mapInstance.on('zoomstart', (evt: MapTouchEvent | MapMouseEvent) => this.zone.run(() =>
        events.zoomStart.emit(evt)));
    }
    if (events.zoomEvt.observers.length) {
      this.mapInstance.on('zoom', (evt: MapTouchEvent | MapMouseEvent) => this.zone.run(() => events.zoomEvt.emit(evt)));
    }
    if (events.zoomEnd.observers.length) {
      this.mapInstance.on('zoomend', (evt: MapTouchEvent | MapMouseEvent) => this.zone.run(() =>
        events.zoomEnd.emit(evt)));
    }
    if (events.rotateStart.observers.length) {
      this.mapInstance.on('rotatestart', (evt: MapTouchEvent | MapMouseEvent) => this.zone.run(() =>
        events.rotateStart.emit(evt)));
    }
    if (events.rotate.observers.length) {
      this.mapInstance.on('rotate', (evt: MapTouchEvent | MapMouseEvent) => this.zone.run(() => events.rotate.emit(evt)));
    }
    if (events.rotateEnd.observers.length) {
      this.mapInstance.on('rotateend', (evt: MapTouchEvent | MapMouseEvent) => this.zone.run(() =>
        events.rotateEnd.emit(evt)));
    }
    if (events.pitchStart.observers.length) {
      this.mapInstance.on('pitchstart', (evt: EventData) => this.zone.run(() => events.pitchStart.emit(evt)));
    }
    if (events.pitchEvt.observers.length) {
      this.mapInstance.on('pitch', (evt: EventData) => this.zone.run(() => events.pitchEvt.emit(evt)));
    }
    if (events.pitchEnd.observers.length) {
      this.mapInstance.on('pitchend', (evt: EventData) => this.zone.run(() => events.pitchEnd.emit(evt)));
    }
    if (events.boxZoomStart.observers.length) {
      this.mapInstance.on('boxzoomstart', (evt: MapBoxZoomEvent) => this.zone.run(() => events.boxZoomStart.emit(evt)));
    }
    if (events.boxZoomEnd.observers.length) {
      this.mapInstance.on('boxzoomend', (evt: MapBoxZoomEvent) => this.zone.run(() => events.boxZoomEnd.emit(evt)));
    }
    if (events.boxZoomCancel.observers.length) {
      this.mapInstance.on('boxzoomcancel', (evt: MapBoxZoomEvent) => this.zone.run(() => events.boxZoomCancel.emit(evt)));
    }
    if (events.webGlContextLost.observers.length) {
      this.mapInstance.on('webglcontextlost', () => this.zone.run(() => events.webGlContextLost.emit()));
    }
    if (events.webGlContextRestored.observers.length) {
      this.mapInstance.on('webglcontextrestored', () => this.zone.run(() => events.webGlContextRestored.emit()));
    }
    if (events.render.observers.length) {
      this.mapInstance.on('render', () => this.zone.run(() => events.render.emit()));
    }
    if (events.error.observers.length) {
      this.mapInstance.on('error', () => this.zone.run(() => events.error.emit()));
    }
    if (events.data.observers.length) {
      this.mapInstance.on('data', (evt: EventData) => this.zone.run(() => events.data.emit(evt)));
    }
    if (events.styleData.observers.length) {
      this.mapInstance.on('styledata', (evt: EventData) => this.zone.run(() => events.styleData.emit(evt)));
    }
    if (events.sourceData.observers.length) {
      this.mapInstance.on('sourcedata', (evt: EventData) => this.zone.run(() => events.sourceData.emit(evt)));
    }
    if (events.dataLoading.observers.length) {
      this.mapInstance.on('dataloading', (evt: EventData) => this.zone.run(() => events.dataLoading.emit(evt)));
    }
    if (events.styleDataLoading.observers.length) {
      this.mapInstance.on('styledataloading', (evt: EventData) => this.zone.run(() => events.styleDataLoading.emit(evt)));
    }
    if (events.sourceDataLoading.observers.length) {
      this.mapInstance.on('sourcedataloading', (evt: EventData) => this.zone.run(() => events.sourceDataLoading.emit(evt)));
    }
  }

/*
  // TODO move this elsewhere
  private assign(obj: any, prop: any, value: any) {
    if (typeof prop === 'string') {
      // tslint:disable-next-line:no-parameter-reassignment
      prop = prop.split('.');
    }
    if (prop.length > 1) {
      const e = prop.shift();
      this.assign(obj[e] =
        Object.prototype.toString.call(obj[e]) === '[object Object]'
          ? obj[e]
          : {},
        prop,
        value);
    } else {
      obj[prop[0]] = value;
    }
  }
*/
}
