define([
    "esri/SpatialReference",
    "esri/geometry/Point",
], function(SpatialReference, Point) {
    "use strict";

    return {
        proj4: null,

        setProj4: function(proj4) {
            this.proj4 = proj4;
        },
        /**
         * transform a point with Proj4js
         * (use this function if no serverside transformation is needed (for a point)
         * If source srs is the same as target srs ignore transformation
         * @param sourceGeom point to transform
         * @param targetSrs srs to transform the point to
         * @returns {Point} the (original) transformed point
         */
        transformProj4js: function(sourceGeom, targetSrs) {
            //NB: Only works with points.

            //No transformation needed if source SRS == target SRS
            if (sourceGeom.spatialReference.wkid === targetSrs) {
                return sourceGeom;
            }

            var sourceEpsg = "EPSG:" + sourceGeom.spatialReference.wkid;
            var destEpsg = "EPSG:" + targetSrs;
            if (sourceEpsg === "EPSG:102100") {
                sourceEpsg = "EPSG:3857";
            }
            if (destEpsg === "EPSG:102100") {
                destEpsg = "EPSG:3857";
            }

            var source = this.proj4(sourceEpsg);
            var dest = this.proj4(destEpsg);

            var p = this.proj4(source, dest).forward([sourceGeom.x, sourceGeom.y]);
            return new Point(p[0], p[1], new SpatialReference({ wkid: parseInt(targetSrs) }));
        }
    };
});