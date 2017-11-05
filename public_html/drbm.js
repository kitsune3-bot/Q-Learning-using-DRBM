
"use strict";

/*
 * Discriminative Restricted Boltzmann Machines
 * Hidden Unit having Ising Spin: h_j \in {-1, +1}
 */
function DRBM(xsize, hsize, ysize) {
    this.xsize = xsize;
    this.hsize = hsize;
    this.ysize = ysize;
    this.node = {};
    this.node["x"] = new Float32Array(xsize);
    this.node["h"] = new Float32Array(hsize);
    this.node["y"] = new Float32Array(ysize);
    this.bias = {};
    this.bias["h"] = new Float32Array(hsize);
    this.bias["y"] = new Float32Array(ysize);
    this.weight = {};
    this.weight["xh"] = new Array(xsize);
    for(var i = 0; i < this.weight["xh"].length; i++)
        this.weight["xh"][i] = new Float32Array(hsize);
    this.weight["hy"] = new Array(xsize);
    for(var j = 0; j < this.weight["hy"].length; j++)
        this.weight["hy"][j] = new Float32Array(ysize);
};

/*
 * Partition function
 * Worning: Partition function is very huge.
 * So it's easy to overflow.
 */
DRBM.prototype.normalizeConstant = function() {
    var value = Math.pow(2, this.hsize) * this.normalizeConstantDiv2H();
    return value;
};

/*
 * z = Z / 2^|H|
 */
DRBM.prototype.normalizeConstantDiv2H = function() {
    var value = 0.0;
    for (var k = 0; k < this.ysize; k++) {
        var k_val = Math.exp(this.bias["y"][k]);
        for (var j = 0; j < this.hsize; j++) {
            k_val += Math.cosh(this.muJK(j, k));
        }
        value += k_val;
    }
    return value;
};

DRBM.prototype.muJK = function(hindex, yindex) {
    var value = this.bias["h"][hindex] + this.weight["hy"][hindex][yindex];
    for (var i = 0; i < this.xsize; i++) {
        value += this.weight["xh"][i][hindex] * this.node["x"][i];
    }
    return value;
};

DRBM.prototype.condProbY = function(yindex) {
    var z_k = this.normalizeConstantDiv2H();
    var value = this.condProbYGivenZ(yindex, z_k);
    return value;
};

DRBM.prototype.condProbYGivenZ = function(yindex) {
    var z_k = this.normalizeConstantDiv2H();
    var potential = 0.0; {
        var k_val = Math.exp(this.bias["y"][k]);
        for (var j = 0; j < this.hsize; j++) {
            var mu_j = this.bias["h"][j] * this.weight["hy"][j][yindex];
            for (var i = 0; i < this.xsize; i++) {
                mu_j += this.weight["xh"][i][j];
            }
            k_val += Math.cosh(mu_j);
        }
        potential += k_val;
    }
    var value = potential / z_k;
    return value;
};

DRBM.prototype.expectedValueXH = function(xindex, hindex) {
    var z = this.normalizeConstantDiv2H();
    var value = this.node["x"][xindex] * this.expectedValueHGivenZ(hindex, z);
    return value;
};

DRBM.prototype.expectedValueXHGivenZ = function(xindex, hindex, z) {
    var value = this.node["x"][xindex] * this.expectedValueHGivenZ(hindex, z);
    return value;
};

DRBM.prototype.expectedValueH = function(hindex) {
    var z = this.normalizeConstantDiv2H();
    var value = this.expectedValueHGivenZ(hindex, z);
    return value;
};

DRBM.prototype.expectedValueHGivenZ = function(hindex, z) {
    var lindex = Array.from({
        length: this.hsize
    }, (v, k) => k);
    lindex.splice(hindex, 1);
    var value = 0.0;
    for (var k = 0; k < this.ysize; k++) {
        var k_val = Math.exp(this.bias["y"][k]);
        for (var l of lindex) {
            k_val *= Math.cosh(this.muJK(l, k));
        }
        k_val *= Math.sinh(this.muJK(hindex, k));
        value += k_val;
    }
    value /= z;
    return value;
};

DRBM.prototype.expectedValueHY = function(hindex, yindex) {
    var z = this.normalizeConstantDiv2H();
    var value = this.expectedValueHYGivenZ(hindex, yindex, z);
    return value;
};

DRBM.prototype.expectedValueHYGivenZ = function(hindex, yindex, z) {
    var lindex = Array.from({
        length: this.hsize
    }, (v, k) => k);
    lindex.splice(hindex, 1);
    var value = Math.exp(this.bias["y"][yindex]);
    for (var l of lindex) {
        value *= Math.cosh(this.muJK(l, yindex));
    }
    value *= Math.sinh(this.muJK(hindex, yindex));
    value /= z;
    return value;
};

DRBM.prototype.expectedValueY = function(yindex) {
    var z = this.normalizeConstantDiv2H();
    var value = this.expectedValueYGivenZ(yindex, z);
    return value;
};

DRBM.prototype.expectedValueYGivenZ = function(yindex, z) {
    var lindex = Array.from({
        length: this.hsize
    }, (v, k) => k);
    var value = Math.exp(this.bias["y"][yindex]);
    for (var l of lindex) {
        value *= Math.cosh(this.muJK(l, yindex));
    }
    value /= z;
    return value;
};

function DRBMTrainer(drbm) {
    this.gradientBias = {};
    this.gradientBias["h"] = new Float32Array(drbm.hsize);
    this.gradientBias["y"] = new Float32Array(drbm.ysize);
    this.gradientWeight = {};
    this.gradientWeight["xh"] = new Array(drbm.xsize);
    for(var i = 0; i < gradientWeight["xh"].length; i++)
        this.gradientWeight["xh"][i] = new Float32Array(drbm.hsize);
    this.gradientWeight["hy"] = new Array(drbm.hsize);
    for(var j = 0; j < gradientWeight["hy"].length; j++)
        this.gradientWeight["hy"][j] = new Float32Array(drbm.ysize);
    this.optimizer = new DRBMOptimizer(drbm);
};

/*
 * @param: drbm object
 * @param: array {x:{}, y}
 * @param: learining_rate
 */
DRBMTrainer.prototype.train = function(drbm, data, learning_rate) {
    // TODO: 学習率で制御しましょうか?(正: 学習, 負: 忘却)
    var z = drbm.normalizeConstantDiv2H();
    // Online Learning(SGD)
    // Gradient
    for (var i = 0; i < drbm.xsize; i++) {
        for (var j = 0; j < drbm.hsize; j++) {
            var gradient = this.dataMeanXH(drbm, data, i, j) - drbm.expectedValueXHGivenZ(i, j, z);
            this.gradientWeight["xh"][i][j] = gradient;
        }
    }
    for (var j = 0; j < drbm.hsize; j++) {
        var gradient = this.dataMeanH(drbm, data, j) - drbm.expectedValueHGivenZ(j, z);
            this.gradientBias["h"][j] = gradient;
    }
    for (var j = 0; j < drbm.hsize; j++) {
        for (var k = 0; k < drbm.ysize; k++) {
            var gradient = this.dataMeanHY(drbm, data, j, k) - drbm.expectedValueHYGivenZ(j, k, z);
            this.gradientWeight["hy"][j][k] = gradient;
        }
    }
    for (var k = 0; k < drbm.ysize; k++) {
        var gradient = this.dataMeanY(drbm, data, k) - drbm.expectedValueYGivenZ(k, z);
        this.gradientBias["y"][k] = gradient;
    }
    
    // update
   for (var i = 0; i < drbm.xsize; i++) {
        for (var j = 0; j < drbm.hsize; j++) {
            var gradient = this.gradientWeight["xh"][i][j];
            var delta = this.optimizer.deltaWeight("xh", i, j, gradient);
            var new_param = drbm.weight["xh"][i][j] + delta;
            drbm.weight["xh"][i][j] = new_param;
        }
    }
    for (var j = 0; j < drbm.hsize; j++) {
        var gradient = this.gradientBias["h"][j];
        var delta = this.optimizer.deltaBias("h", j, gradient);
        var new_param = drbm.bias["h"][j] + delta;
        drbm.bias["h"][j] = new_param;
    }
    for (var j = 0; j < drbm.hsize; j++) {
        for (var k = 0; k < drbm.ysize; k++) {
            var gradient = this.gradientWeight["hy"][j][k];
            var delta = this.optimizer.deltaWeight("hy", j, k, gradient);
            var new_param = drbm.weight["hy"][j][k] + delta;
            drbm.weight["hy"][j][k] = new_param;
        }
    }
    for (var k = 0; k < drbm.ysize; k++) {
        var gradient = this.gradientBias["y"][k];
        var delta = this.optimizer.deltaBias("y", k, gradient);
        var new_param = drbm.bias["y"][k] + delta;
        drbm.bias["y"][k] = new_param;
    }
    
    // update optimizer
    this.optimizer.iteration++;
 };

DRBMTrainer.prototype.dataMeanXH = function(drbm, data, xindex, hindex) {
    var mu = drbm.bias["h"][hindex] + drbm.weight["hy"][hindex][data.y];
    for (var i = 0; i < drbm.xsize; i++) {
        mu += drbm.weight["xh"][i][hindex] * data.x[i];
    }
    var value = data.x[xindex] * Math.tanh(mu);
    return value;
};

DRBMTrainer.prototype.dataMeanH = function(drbm, data, hindex) {
    var mu = drbm.bias["h"][hindex] + drbm.weight["hy"][hindex][data.y];
    for (var i = 0; i < drbm.xsize; i++) {
        mu += drbm.weight["xh"][i][hindex] * data.x[i];
    }
    var value = Math.tanh(mu);
    return value;
};

DRBMTrainer.prototype.dataMeanHY = function(drbm, data, hindex, yindex) {
    if (yindex !== data.y) return 0.0;
    var mu = drbm.bias["h"][hindex] + drbm.weight["hy"][hindex][data.y];
    for (var i = 0; i < drbm.xsize; i++) {
        mu += drbm.weight["xh"][i][hindex] * data.x[i];
    }
    var value = Math.tanh(mu);
    return value;
};

DRBMTrainer.prototype.dataMeanY = function(drbm, data, yindex) {
    var value = (yindex !== data.y) ? 0.0 : 1.0;
    return value;
};

/*
 * Optimizer: Adamax
 */
function DRBMOptimizer(drbm) {
    this.alpha = 0.001;
    this.beta1 = 0.9;
    this.beta2 = 0.999;
    this.epsilon = 1E-08;
    this.iteration = 1;
    this.momentBias1 = {};
    this.momentBias1["h"] = new Float32Array(drbm.hsize);
    this.momentBias1["y"] = new Float32Array(drbm.ysize);
    this.momentWeight1 = {};
    this.momentWeight1["xh"] = new Array(drbm.xsize);
    for(var i = 0; i < this.momentWeight1["xh"].length; i++)
         this.momentWeight1["xh"][i] = new Float32Array(drbm.hsize);
    this.momentWeight1["hy"] = new Array(drbm.xsize);
    for(var j = 0; j < this.momentWeight1["hy"].length; j++)
         this.momentWeight1["hy"][j] = new Float32Array(drbm.hsize);
    this.momentBias2 = {};
    this.momentBias2["h"] = new Float32Array(drbm.hsize);
    this.momentBias2["y"] = new Float32Array(drbm.ysize);
    this.momentWeight2 = {};
    this.momentWeight2["xh"] = new Array(drbm.xsize);
    for(var i = 0; i < this.momentWeight2["xh"].length; i++)
         this.momentWeight2["xh"][i] = new Float32Array(drbm.hsize);
    this.momentWeight2["hy"] = new Array(drbm.xsize);
    for(var j = 0; j < this.momentWeight2["hy"].length; j++)
         this.momentWeight2["hy"][j] = new Float32Array(drbm.hsize);
};

DRBMOptimizer.prototype.deltaBias = function(name, index, gradient) {
    var m = this.momentBias1[name][index] = this.beta1 * this.momentBias1[name][index] + (1.0 - this.beta1) * gradient;
    var v = this.momentBias2[name][index] = Math.max(this.beta2 * this.momentBias2[name][index], Math.abs(gradient));
    var delta = this.alpha / (1.0 - Math.pow(this.beta1, this.iteration)) * m / (v + this.epsilon);
    return delta;
};

DRBMOptimizer.prototype.deltaWeight = function(name, i, j, gradient) {
    var m = this.momentWeight1[name][j] = this.beta1 * this.momentWeight1[name][j] + (1.0 - this.beta1) * gradient;
    var v = this.momentWeight2[name][j] = Math.max(this.beta2 * this.momentWeight2[name][j], Math.abs(gradient));
    var delta = this.alpha / (1.0 - Math.pow(this.beta1, this.iteration)) * m / (v + this.epsilon);
    return delta;
};
